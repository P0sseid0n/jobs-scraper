import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import {
	CvBaseValidationRequestSchema,
	CvRequestSchema,
	type CvBaseValidationRequest,
	type CvBaseValidationResult,
	type CvRequest,
	type CvResult,
} from '@shared/contracts'
import { Job } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadCredentials } from '@shared/settings'

import { requestApplicationMessage } from './application-message'
import { checkBaseResume, loadBaseResume, validateBaseTex } from './base-resume'
import { cvUpdaterEnv } from './config'
import { compileLatex, LatexCompileError } from './latex-compiler'
import { chooseProjects } from './projects/choose-projects'
import { GithubRepositories } from './projects/github-repositories'
import { pdfFileName, renderOnePagePdf } from './resume-pdf'
import { tailorResumeToJob } from './tailor-resume'
import { requestTailoringSuggestions } from './tailoring-suggestions'
import type { CvJob } from './target-job'

const { config, logger, queue } = await startService({
	name: 'cv-updater',
	env: { ...ollamaEnv, ...cvUpdaterEnv },
	database: true,
})

const compileOptions = { tectonicBin: config.TECTONIC_BIN, fontsDir: config.CV_FONTS_DIR }
const ollama = new Ollama({ host: config.OLLAMA_HOST })

try {
	await checkBaseResume(config.CV_TEX_FILE, compileOptions, logger)
} catch (error) {
	logger.fatal({ err: error }, 'Não foi possível preparar o currículo base')
	process.exit(1)
}

await queue.consume(QUEUES.cvUpdater, CvRequestSchema, generateCv)
// Em paralelo aos currículos: uma validação não espera a geração em andamento
await queue.consume(QUEUES.cvUpdaterBase, CvBaseValidationRequestSchema, validateBaseResume)

/** Gera o currículo da vaga pedida e envia o PDF (ou o motivo da falha) para a fila de resposta de quem pediu. */
async function generateCv(request: CvRequest) {
	const log = logger.child({ postId: request.postId, replyTo: request.replyTo.queue })

	const reply = (result: Omit<CvResult, 'postId' | 'context'>) =>
		queue.publish(request.replyTo.queue, { postId: request.postId, context: request.replyTo.context, ...result })

	const job = await findTargetJob(request.postId)
	if (!job) {
		log.warn('Vaga não encontrada no banco')
		await reply({ jobTitle: null, file: null, error: 'Não encontrei essa vaga no banco de dados.', message: null })
		return
	}

	log.info({ title: job.title }, 'Gerando currículo ajustado')

	const { resume: base, versionId } = await loadBaseResume(config.CV_TEX_FILE)
	const suggestions = await requestTailoringSuggestions({ ollama, model: config.OLLAMA_MODEL }, base.model, job, log)

	const { cv, report } = tailorResumeToJob(base.model, job, suggestions)
	if (report.summaryRejected) {
		log.warn({ reason: report.summaryRejected }, 'Apresentação da IA descartada; mantendo a original')
	}

	cv.projects = await chooseProjects(
		{ github: await githubClient(), ollama, model: config.OLLAMA_MODEL, maxProjects: config.CV_MAX_PROJECTS },
		base,
		cv.projects,
		job,
		log,
	)

	let pdf: Buffer
	try {
		pdf = await renderOnePagePdf(base, cv, compileOptions, log)
	} catch (error) {
		if (!(error instanceof LatexCompileError)) throw error

		log.error({ err: error }, 'Erro ao compilar o currículo')
		await reply({
			jobTitle: job.title,
			file: null,
			error: 'O LaTeX do currículo não compilou. Veja os logs do cv-updater.',
			message: null,
		})
		return
	}

	const name = pdfFileName(job)
	await savePdf(name, pdf)

	// Só com e-mail de contato: sem ele, a candidatura é pelo site da vaga ou pelo post, e a mensagem não seria usada
	const message = job.recruiterEmail ? await requestApplicationMessage({ ollama, model: config.OLLAMA_MODEL }, cv, job, log) : null

	await reply({ jobTitle: job.title, file: { name, base64: pdf.toString('base64') }, error: null, message })

	log.info(
		{
			file: name,
			baseVersion: versionId ?? 'arquivo',
			added: report.addedSkills.map(entry => entry.skill),
			removed: report.removedSkills,
			message: !!message,
		},
		'Currículo enviado',
	)
}

/** Valida um `.tex` candidato a currículo base e devolve os erros (ou nenhum) e a pré-visualização a quem pediu. */
async function validateBaseResume(request: CvBaseValidationRequest) {
	const log = logger.child({ validationId: request.validationId, replyTo: request.replyTo.queue })
	log.info({ bytes: Buffer.byteLength(request.tex) }, 'Validando um currículo base')

	const { errors, pdf, pages } = await validateBaseTex(request.tex, tex => compileLatex(tex, compileOptions))

	await queue.publish(request.replyTo.queue, {
		validationId: request.validationId,
		context: request.replyTo.context,
		errors,
		pages,
		pdf: pdf?.toString('base64') ?? null,
	} satisfies CvBaseValidationResult)

	log.info({ valid: errors.length === 0, errors: errors.length, pages }, 'Validação do currículo base enviada')
}

async function findTargetJob(postId: string): Promise<CvJob | null> {
	const job = await Job.findOne({ postId }).lean()
	if (!job) return null

	return {
		title: job.title ?? null,
		company: job.company ?? null,
		necessaryKnowledge: job.necessaryKnowledge ?? null,
		rawContent: job.rawContent,
		language: job.language ?? null,
		recruiterEmail: job.recruiterEmail ?? null,
	}
}

/** Guarda uma cópia local do currículo gerado (histórico). */
async function savePdf(name: string, pdf: Buffer) {
	await mkdir(config.CV_OUTPUT_DIR, { recursive: true })
	await Bun.write(path.join(config.CV_OUTPUT_DIR, name), pdf)
}

/** O cliente do GitHub da conta atual, reaproveitado enquanto ela não muda (ele controla o limite de requisições). */
let github: { key: string; client: GithubRepositories } | null = null

/** Relê a conta do GitHub a cada currículo: a salva pelo site vale sem reiniciar. Sem conta, ficam os projetos do .tex. */
async function githubClient() {
	const account = (await loadCredentials('github'))?.value
	if (!account) return null

	const key = JSON.stringify([account.username, account.token])
	if (github?.key !== key) {
		github = {
			key,
			client: new GithubRepositories({
				username: account.username,
				token: account.token,
				exclude: config.GITHUB_EXCLUDE_REPOS,
				cacheDir: config.CV_CACHE_DIR,
				cacheHours: config.GITHUB_CACHE_HOURS,
				logger,
			}),
		}
	}

	return github.client
}
