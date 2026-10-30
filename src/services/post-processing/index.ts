import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import {
	ProcessedJobSchema,
	RawPostSchema,
	type CorrectableField,
	type JobLookup,
	type JobReprocessResult,
	type JobReprocessStatus,
	type RawPost,
} from '@shared/contracts'
import { SeenPost, type SeenPostOutcome } from '@shared/database'
import { QUEUES, TaskLock } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings, readSettings } from '@shared/settings'

import { extractionPromptVersion } from './extraction-prompt'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'
import { companyRejection, relevanceRejection } from './job-relevance'
import { resumeSavedJob, saveJob, updateJob } from './job-store'
import { rejectionReason } from './model-response'
import {
	listingKeywordText,
	listingPostId,
	roleLinePostId,
	splitMultiJobPost,
	splitRoleListPost,
	type JobListing,
	type RoleLine,
} from './multi-job-post'
import { checkLanguage } from './post-language'

const { config, logger, queue } = await startService({
	name: 'post-processing',
	env: ollamaEnv,
	database: true,
})

const ollama = new Ollama({ host: config.OLLAMA_HOST })
await ensureModelAvailable()

await queue.assertQueue(QUEUES.scraperLookup)
await queue.assertQueue(QUEUES.webReprocess)
// Um post por vez no modelo, das duas filas: o "processar de novo" do site passa à frente dos posts de uma coleta
const model = new TaskLock()
const processQueued = (post: RawPost) =>
	model.run(
		// A vaga de uma lista processada de novo segue como da primeira vez: as imagens do post (com todas as vagas) não
		// vão ao modelo (ver `processRoleList`)
		() => processPost(post, { imagesToModel: !(post.reprocessId && post.sourcePostId) }),
		{ priority: !!post.reprocessId },
	)
await queue.consume(QUEUES.postProcessing, RawPostSchema, processQueued)
await queue.consume(QUEUES.postProcessingReprocess, RawPostSchema, processQueued)

// Esvazia a fila do antigo serviço storage (vagas enviadas antes da junção); remover na próxima versão
await queue.consume(
	QUEUES.storage,
	ProcessedJobSchema,
	async job => {
		await saveJob(job, { queue, logger })
	},
	{ prefetch: 10 },
)

/**
 * Post que lista várias vagas: pede ao scraper para abrir o link de cada uma ou, com um link só para todas, processa
 * cada vaga relevante à parte (`processRoleList`). Senão, descarta o post se ele estiver
 * fora dos idiomas aceitos (antes da extração; em texto curto, o idioma é perguntado ao modelo), extrai a vaga e, se
 * for uma vaga relevante (palavras-chave) de uma empresa não bloqueada, salva no MongoDB e anuncia para os canais. Cada post é processado uma
 * única vez. Com `imagesToModel: false`, as imagens são guardadas com a vaga sem ir para a extração.
 *
 * O "processar de novo" do site (`reprocessId`) passa pelos mesmos filtros e pela extração, mas atualiza a vaga já salva
 * (`updateJob`), sem anunciar; se ela fosse descartada agora, fica como estava. O resultado volta ao site.
 */
async function processPost(post: RawPost, { imagesToModel = true } = {}) {
	const log = logger.child({ postId: post.postId })

	if (!post.reprocessId && (await SeenPost.exists({ postId: post.postId }))) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	if (!post.reprocessId && (await resumeSavedJob(post.postId, { queue, logger }))) {
		await markAsSeen(post, 'saved')
		return
	}

	const settings = await loadSettings('post-processing')
	// A vaga processada de novo já foi uma vaga só: não é dividida outra vez
	const single = !!post.sourcePostId || !!post.reprocessId

	// Antes do idioma: esses posts costumam misturar cargos em inglês; o idioma de cada vaga é visto na página dela
	const listings = single ? null : splitMultiJobPost(post.text)
	if (listings) {
		await requestLookups(post, listings, settings)
		await markAsSeen(post, 'multi-job')
		return
	}

	const roles = single ? null : splitRoleListPost(post.text)
	if (roles) {
		await markAsSeen(post, await processRoleList(post, roles, settings))
		return
	}

	const { language, rejection } = await checkLanguage(ollama, config.OLLAMA_MODEL, post.text, settings.allowedLanguages)

	if (rejection) {
		log.info({ reason: rejection }, 'Post descartado')
		await markAsSeen(post, 'language', rejection)
		return
	}

	const extracted = imagesToModel ? post : { ...post, images: [] }
	log.info({ language, images: extracted.images.length }, 'Processando post')
	// Sem perfil, `targetRole` fica ausente e o modelo extrai a primeira vaga de um post com várias
	const { targetRole } = await readSettings('profile')
	const aiJob = await extractJobFromPost(ollama, config.OLLAMA_MODEL, extracted, targetRole ?? null)
	const reason = rejectionReason(aiJob)

	if (!aiJob || reason) {
		log.info({ reason }, 'Post descartado')
		await markAsSeen(post, 'not-a-job', reason)
		return
	}

	const job = { ...buildProcessedJob(extracted, aiJob, language), imageCount: post.images.length }
	const irrelevant = relevanceRejection(job, settings)

	if (irrelevant) {
		log.info({ reason: irrelevant, title: job.title }, 'Vaga descartada')
		await markAsSeen(post, 'keywords', irrelevant)
		return
	}

	const blocked = companyRejection(job, settings)

	if (blocked) {
		log.info({ reason: blocked.reason, title: job.title }, 'Vaga descartada')
		await markAsSeen(post, 'blocked-company', blocked.reason, { blockedBy: blocked.blockedBy })
		return
	}

	log.info({ extractionChecks: job.extractionChecks, title: job.title }, 'Vaga estruturada')
	const source = { extractionModel: config.OLLAMA_MODEL, promptVersion: extractionPromptVersion(extracted) }

	if (post.reprocessId) {
		const updated = await updateJob(job, source, post.images)
		if (updated === 'missing') await reportReprocess(post, 'discarded', MISSING_FIELDS_REASON)
		else if (updated) await reportReprocess(post, 'updated', null, updated.keptFields)
		else await reportReprocess(post, 'failed', 'A vaga não existe mais')

		log.info({ updated: typeof updated === 'object' }, '🔁 Vaga processada de novo')
		return
	}

	const saved = await saveJob(job, { queue, logger }, source, post.images)
	await markAsSeen(post, saved ? 'saved' : 'missing-fields')
}

const MISSING_FIELDS_REASON = 'A nova extração ficou sem o cargo'
const NOT_A_JOB_REASON = 'A IA não reconheceu uma vaga no texto'

/** O resultado do "processar de novo" para o site. */
function reportReprocess(post: RawPost, status: JobReprocessStatus, reason: string | null, keptFields: CorrectableField[] = []) {
	const result: JobReprocessResult = { reprocessId: post.reprocessId!, postId: post.postId, status, reason, keptFields }

	return queue.publish(QUEUES.webReprocess, result)
}

/**
 * Pede ao scraper para abrir o link de cada vaga relevante da lista. O filtro de palavras-chave olha o texto da vaga
 * na lista (cargo e linhas até o link), para não abrir no LinkedIn páginas de vagas que seriam descartadas.
 */
async function requestLookups(post: RawPost, listings: JobListing[], settings: KeywordSettings) {
	const log = logger.child({ postId: post.postId })
	let requested = 0

	for (const listing of listings) {
		const irrelevant = relevanceRejection({ title: listingKeywordText(listing), necessaryKnowledge: null }, settings)
		if (irrelevant) {
			log.debug({ title: listing.title, reason: irrelevant }, 'Vaga da lista descartada')
			continue
		}

		const postId = listingPostId(listing.link)
		if (await SeenPost.exists({ postId })) continue

		const lookup: JobLookup = {
			postId,
			sourcePostId: post.postId,
			sourcePostUrl: post.url,
			...listing,
			author: post.author,
			authorIsCompany: post.authorIsCompany,
			authorHeadline: post.authorHeadline,
			postedAt: post.postedAt,
			requestedAt: new Date().toISOString(),
			reprocessId: null,
		}
		await queue.publish(QUEUES.scraperLookup, lookup)
		requested++
	}

	log.info({ listings: listings.length, requested }, '📋 Post com várias vagas: links enviados para o scraper abrir')
}

/**
 * Post que lista várias vagas com um link só: cada vaga relevante (palavras-chave na linha dela) é processada aqui
 * como um post à parte, com o texto sem as linhas das outras vagas. Não há página para abrir: o post já traz tudo.
 * @returns O destino do post: `saved` se alguma vaga foi salva; senão o da primeira vaga, ou `keywords` sem nenhuma.
 */
async function processRoleList(post: RawPost, roles: RoleLine[], settings: KeywordSettings): Promise<SeenPostOutcome> {
	const relevant = roles.filter(role => !relevanceRejection({ title: role.title, necessaryKnowledge: null }, settings))
	logger.info(
		{ postId: post.postId, roles: roles.length, relevant: relevant.length },
		'📋 Post com várias vagas e um link só: cada vaga relevante é processada à parte',
	)

	const outcomes: SeenPostOutcome[] = []
	for (const role of relevant) {
		const postId = roleLinePostId(post.postId, role.title)
		// As imagens são do post inteiro, com todas as vagas: ficam na vaga para quem a lê, mas não vão ao modelo, que
		// misturaria os dados das outras vagas (como fazia com o texto inteiro)
		await processPost({ ...post, postId, text: role.text, sourcePostId: post.postId, jobLink: null }, { imagesToModel: false })

		const seen = await SeenPost.findOne({ postId }, { outcome: 1 }).lean()
		if (seen?.outcome) outcomes.push(seen.outcome)
	}

	return outcomes.includes('saved') ? 'saved' : (outcomes[0] ?? 'keywords')
}

type KeywordSettings = { requiredKeywords: string[]; excludedKeywords: string[] }

/**
 * Registra o destino do post (o histórico de coletas mostra os motivos de descarte); a IA o viu como vaga ou não.
 * `blockedBy` é a empresa bloqueada que descartou a vaga.
 */
function markAsSeen(post: RawPost, outcome: SeenPostOutcome, reason?: string | null, { blockedBy }: { blockedBy?: string } = {}) {
	// Processada de novo, a vaga descartada agora fica como estava: o motivo só volta ao site
	if (post.reprocessId) {
		return reportReprocess(post, 'discarded', reason ?? (outcome === 'missing-fields' ? MISSING_FIELDS_REASON : NOT_A_JOB_REASON))
	}

	const isJob = outcome === 'saved' || outcome === 'keywords' || outcome === 'blocked-company' || outcome === 'missing-fields'

	return SeenPost.updateOne(
		{ postId: post.postId },
		{ $setOnInsert: { postId: post.postId, isJob, outcome, ...(reason && { reason }), ...(blockedBy && { blockedBy }) } },
		{ upsert: true },
	)
}

/** Encerra o serviço com uma instrução clara se o modelo não estiver baixado no Ollama. */
async function ensureModelAvailable() {
	try {
		await ollama.show({ model: config.OLLAMA_MODEL })
	} catch (error) {
		logger.fatal(
			{ err: error, model: config.OLLAMA_MODEL, host: config.OLLAMA_HOST },
			`Modelo indisponível no Ollama. Rode: docker compose exec ollama ollama pull ${config.OLLAMA_MODEL}`,
		)
		process.exit(1)
	}
}
