import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Ollama } from 'ollama'

import { loadConfig, ollamaEnv } from '@shared/config'
import { CvRequestSchema, type CvRequest, type CvResult } from '@shared/contracts'
import { Job } from '@shared/database'
import { createLogger } from '@shared/logging'
import { QUEUES } from '@shared/messaging'
import type { ModuleContext } from '@shared/service'

import { requestApplicationMessage } from './application-message'
import { checkBaseResume, loadBaseResume } from './base-resume'
import { cvUpdaterEnv } from './config'
import { LatexCompileError } from './latex-compiler'
import { chooseProjects } from './projects/choose-projects'
import { GithubRepositories } from './projects/github-repositories'
import { pdfFileName, renderOnePagePdf } from './resume-pdf'
import { tailorResumeToJob } from './tailor-resume'
import { requestTailoringSuggestions } from './tailoring-suggestions'
import type { CvJob } from './target-job'

/** Consome os pedidos da fila `cv-updater` e devolve o currículo em PDF na fila de resposta de quem pediu. */
export async function startCvUpdater({ queue }: ModuleContext) {
	const logger = createLogger('cv-updater')
	const config = loadConfig({ ...ollamaEnv, ...cvUpdaterEnv })

	const compileOptions = { tectonicBin: config.TECTONIC_BIN, fontsDir: config.CV_FONTS_DIR }
	const ollama = new Ollama({ host: config.OLLAMA_HOST })
	const github = createGithubClient()

	try {
		await checkBaseResume(config.CV_TEX_FILE, compileOptions, logger)
	} catch (error) {
		logger.fatal(
			{ err: error },
			'Não foi possível preparar o currículo base (para rodar sem currículos, tire o cv-updater do APP_MODULES)',
		)
		process.exit(1)
	}

	await queue.consume(QUEUES.cvUpdater, CvRequestSchema, generateCv)

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

		const base = await loadBaseResume(config.CV_TEX_FILE)
		const suggestions = await requestTailoringSuggestions({ ollama, model: config.OLLAMA_MODEL }, base.model, job, log)

		const { cv, report } = tailorResumeToJob(base.model, job, suggestions)
		if (report.summaryRejected) {
			log.warn({ reason: report.summaryRejected }, 'Apresentação da IA descartada; mantendo a original')
		}

		cv.projects = await chooseProjects(
			{ github, ollama, model: config.OLLAMA_MODEL, maxProjects: config.CV_MAX_PROJECTS },
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
			{ file: name, added: report.addedSkills.map(entry => entry.skill), removed: report.removedSkills, message: !!message },
			'Currículo enviado',
		)
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

	function createGithubClient() {
		if (!config.GITHUB_USERNAME) return null

		return new GithubRepositories({
			username: config.GITHUB_USERNAME,
			token: config.GITHUB_TOKEN,
			exclude: config.GITHUB_EXCLUDE_REPOS,
			cacheDir: config.CV_CACHE_DIR,
			cacheHours: config.GITHUB_CACHE_HOURS,
			logger,
		})
	}
}
