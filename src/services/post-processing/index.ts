import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import { ProcessedJobSchema, RawPostSchema, type JobLookup, type RawPost } from '@shared/contracts'
import { SeenPost } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings } from '@shared/settings'

import { extractionEnv, listFromEnv } from './config'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'
import { relevanceRejection } from './job-relevance'
import { resumeSavedJob, saveJob } from './job-store'
import { rejectionReason } from './model-response'
import { listingPostId, splitMultiJobPost, type JobListing } from './multi-job-post'
import { checkPostLanguage } from './post-language'

const { config, logger, queue } = await startService({
	name: 'post-processing',
	env: { ...ollamaEnv, ...extractionEnv },
	database: true,
})

const ollama = new Ollama({ host: config.OLLAMA_HOST })
await ensureModelAvailable()

// Valores iniciais da coleção `settings`; depois as regras de descarte são editáveis por outras fontes
const settingsSeed = {
	minJobConfidence: config.MIN_JOB_CONFIDENCE,
	allowedLanguages: listFromEnv(config.JOB_LANGUAGES),
	requiredKeywords: listFromEnv(config.JOB_REQUIRED_KEYWORDS),
	excludedKeywords: listFromEnv(config.JOB_EXCLUDED_KEYWORDS),
}
await loadSettings('post-processing', settingsSeed)

await queue.assertQueue(QUEUES.scraperLookup)
await queue.consume(QUEUES.postProcessing, RawPostSchema, processPost)

// Esvazia a fila do antigo serviço storage (vagas enviadas antes da junção); remover na próxima versão
await queue.consume(QUEUES.storage, ProcessedJobSchema, job => saveJob(job, { queue, logger }), { prefetch: 10 })

/**
 * Post que lista várias vagas: pede ao scraper para abrir o link de cada uma. Senão, descarta o post se ele estiver
 * fora dos idiomas aceitos (sem chamar a IA), extrai a vaga e, se for uma vaga relevante (palavras-chave), salva no
 * MongoDB e anuncia para os canais. Cada post é processado uma única vez.
 */
async function processPost(post: RawPost) {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	if (await resumeSavedJob(post.postId, { queue, logger })) {
		await markAsSeen(post, true)
		return
	}

	const settings = await loadSettings('post-processing', settingsSeed)

	// Antes do idioma: esses posts costumam misturar cargos em inglês; o idioma de cada vaga é visto na página dela
	const listings = post.sourcePostId ? null : splitMultiJobPost(post.text)
	if (listings) {
		await requestLookups(post, listings, settings)
		await markAsSeen(post, false)
		return
	}

	const { language, rejection } = checkPostLanguage(post.text, settings.allowedLanguages)

	if (rejection) {
		log.info({ reason: rejection }, 'Post descartado')
		await markAsSeen(post, false)
		return
	}

	log.info({ language }, 'Processando post')
	const aiJob = await extractJobFromPost(ollama, config.OLLAMA_MODEL, post)
	const reason = rejectionReason(aiJob, settings.minJobConfidence)

	if (!aiJob || reason) {
		log.info({ reason, aiJobConfidence: aiJob?.aiJobConfidence }, 'Post descartado')
		await markAsSeen(post, false)
		return
	}

	const job = buildProcessedJob(post, aiJob, language)
	const irrelevant = relevanceRejection(job, settings)

	if (irrelevant) {
		log.info({ reason: irrelevant, title: job.title }, 'Vaga descartada')
	} else {
		log.info({ aiJobConfidence: job.aiJobConfidence, title: job.title }, 'Vaga estruturada')
		await saveJob(job, { queue, logger })
	}

	await markAsSeen(post, true)
}

/**
 * Pede ao scraper para abrir o link de cada vaga relevante da lista. O filtro de palavras-chave olha só o cargo
 * (é o que a lista mostra), para não abrir no LinkedIn páginas de vagas que seriam descartadas.
 */
async function requestLookups(post: RawPost, listings: JobListing[], settings: KeywordSettings) {
	const log = logger.child({ postId: post.postId })
	let requested = 0

	for (const listing of listings) {
		const irrelevant = relevanceRejection({ title: listing.title, necessaryKnowledge: null }, settings)
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
			postedAt: post.postedAt,
			requestedAt: new Date().toISOString(),
		}
		await queue.publish(QUEUES.scraperLookup, lookup)
		requested++
	}

	log.info({ listings: listings.length, requested }, '📋 Post com várias vagas: links enviados para o scraper abrir')
}

type KeywordSettings = { requiredKeywords: string[]; excludedKeywords: string[] }

function markAsSeen(post: RawPost, isJob: boolean) {
	return SeenPost.updateOne({ postId: post.postId }, { $setOnInsert: { postId: post.postId, isJob } }, { upsert: true })
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
