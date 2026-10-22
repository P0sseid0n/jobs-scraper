/**
 * Roda o prompt e o modelo atuais sobre as vagas corrigidas pelo site e mostra o acerto por campo, ao lado do acerto
 * da extração original, no total e separado entre dev e outras áreas (campo `area` do caso). Serve para comparar duas
 * versões do prompt ou dois modelos antes de trocar. Fica fora do CI: precisa do Ollama.
 *
 * Uso: bun eval:extraction [--model gemma3:12b] [--fixtures] [--limit 50] [--verbose]
 * - sem `--fixtures`, lê a coleção `extraction_feedback` do MongoDB (MONGO_URL);
 * - com `--fixtures`, usa os casos versionados (`fixtures/extraction-cases.json`), sem banco.
 * O cargo-alvo de cada caso é o dele (`targetRole`) ou, sem ele, o do perfil salvo (só sem `--fixtures`).
 */
import { parseArgs } from 'node:util'
import { Ollama } from 'ollama'

import { loadConfig, mongoEnv, ollamaEnv } from '@shared/config'
import { CORRECTABLE_FIELDS, PostProcessingSettingsSchema, ProfileSettingsSchema } from '@shared/contracts'
import { connectDatabase, disconnectDatabase, ExtractionFeedback, Settings } from '@shared/database'
import { createLogger } from '@shared/logging'

import {
	caseToRawPost,
	ExtractionCaseSchema,
	formatReport,
	groupByArea,
	latestPerPost,
	runFromModel,
	sameFieldValue,
	scoreCases,
	type CaseRun,
	type ExtractionCase,
} from './extraction-eval'
import { EXTRACTION_PROMPT_VERSION } from './extraction-prompt'
import { DEFAULT_FIXTURES_PATH, readFixtures } from './feedback-fixtures'
import { extractJobFromPost } from './job-extraction'
import { checkLanguage } from './post-language'

const logger = createLogger('eval-extraction')

const { values: args } = parseArgs({
	options: {
		model: { type: 'string' },
		fixtures: { type: 'boolean', default: false },
		limit: { type: 'string' },
		verbose: { type: 'boolean', default: false },
	},
})

const { OLLAMA_HOST, OLLAMA_MODEL } = loadConfig(ollamaEnv)
const model = args.model ?? OLLAMA_MODEL
const ollama = new Ollama({ host: OLLAMA_HOST })

try {
	await ollama.show({ model })
} catch (error) {
	logger.fatal({ err: error, model, host: OLLAMA_HOST }, `Modelo indisponível no Ollama. Rode: ollama pull ${model}`)
	process.exit(1)
}

const { cases, settings, targetRole } = args.fixtures ? await fromFixtures() : await fromDatabase()
const selected = args.limit ? cases.slice(-Number(args.limit)) : cases

if (selected.length === 0) {
	logger.info('Nenhum caso para avaliar: corrija vagas pelo site (ou exporte fixtures) antes')
	process.exit(0)
}

logger.info({ model, promptVersion: EXTRACTION_PROMPT_VERSION, cases: selected.length }, 'Avaliando a extração')

const results: { item: ExtractionCase; run: CaseRun }[] = []
for (const [index, item] of selected.entries()) {
	let run: CaseRun = { isJob: false, fields: null }
	try {
		// Como no post-processing, o post fora dos idiomas aceitos nem chega à extração
		const { rejection } = await checkLanguage(ollama, model, item.post.text, settings.allowedLanguages)
		if (!rejection) {
			const aiJob = await extractJobFromPost(ollama, model, caseToRawPost(item), item.targetRole ?? targetRole)
			run = runFromModel(item, aiJob, settings.minJobConfidence)
		}
	} catch (error) {
		// Conta como erro em todos os campos, mas segue com os outros casos
		logger.warn({ err: error, postId: item.postId }, 'Falha ao extrair o caso')
	}

	results.push({ item, run })
	if (args.verbose) printDiff(item, run)
	else if ((index + 1) % 10 === 0) logger.info(`${index + 1}/${selected.length} casos`)
}

console.log(
	`\nmodelo ${model} · prompt ${EXTRACTION_PROMPT_VERSION} · ${selected.length} casos · confiança mínima ${settings.minJobConfidence} · idiomas ${settings.allowedLanguages.join(', ') || 'todos'} · cargo-alvo ${targetRole ?? 'nenhum'} (fora os casos com o seu)\n`,
)
console.log(formatReport(scoreCases(results)))

const groups = groupByArea(results)
if (groups.length > 1) {
	for (const [label, group] of groups) console.log(`\n${label} (${group.length} casos)\n${formatReport(scoreCases(group))}`)
}
console.log('\noriginal: a extração salva na vaga (modelo e prompt da época) · atual: este prompt e modelo')

async function fromDatabase() {
	const { MONGO_URL } = loadConfig(mongoEnv)
	await connectDatabase(MONGO_URL, logger)

	try {
		// Em ordem cronológica: de cada post fica a correção mais recente
		const docs = await ExtractionFeedback.find().sort({ createdAt: 1 }).lean()
		const settings = await Settings.findById('post-processing').lean()
		const profile = await Settings.findById('profile').lean()

		return {
			cases: latestPerPost(docs.map(doc => ExtractionCaseSchema.parse(doc))),
			settings: PostProcessingSettingsSchema.parse(settings?.values ?? {}),
			targetRole: ProfileSettingsSchema.parse(profile?.values ?? {}).targetRole ?? null,
		}
	} finally {
		await disconnectDatabase()
	}
}

async function fromFixtures() {
	return {
		cases: await readFixtures(DEFAULT_FIXTURES_PATH),
		settings: PostProcessingSettingsSchema.parse({}),
		targetRole: null,
	}
}

function printDiff(item: ExtractionCase, run: CaseRun) {
	const expectedIsJob = item.kind !== 'not-a-job'
	const lines: string[] = []

	if (run.isJob !== expectedIsJob) lines.push(`  é vaga?: esperado ${expectedIsJob}, atual ${run.isJob}`)
	if (item.expected) {
		for (const field of CORRECTABLE_FIELDS) {
			const expected = item.expected[field]
			const actual = run.fields?.[field] ?? null
			if (!sameFieldValue(field, expected, actual)) {
				lines.push(`  ${field}: esperado ${JSON.stringify(expected)}, atual ${JSON.stringify(actual)}`)
			}
		}
	}

	const label = `${item.postId} (${item.area}${item.targetRole ? `, cargo-alvo ${item.targetRole}` : ''})`
	console.log(lines.length ? `✗ ${label}\n${lines.join('\n')}` : `✓ ${label}`)
}
