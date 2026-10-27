import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import { ProcessedJobSchema, RawPostSchema, type JobLookup, type RawPost } from '@shared/contracts'
import { SeenPost, type SeenPostOutcome } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings, readSettings } from '@shared/settings'

import { extractionPromptVersion } from './extraction-prompt'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'
import { relevanceRejection } from './job-relevance'
import { resumeSavedJob, saveJob } from './job-store'
import { rejectionReason } from './model-response'
import { listingKeywordText, listingPostId, splitMultiJobPost, type JobListing } from './multi-job-post'
import { checkLanguage } from './post-language'

const { config, logger, queue } = await startService({
	name: 'post-processing',
	env: ollamaEnv,
	database: true,
})

const ollama = new Ollama({ host: config.OLLAMA_HOST })
await ensureModelAvailable()

await queue.assertQueue(QUEUES.scraperLookup)
await queue.consume(QUEUES.postProcessing, RawPostSchema, processPost)

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
 * Post que lista várias vagas: pede ao scraper para abrir o link de cada uma. Senão, descarta o post se ele estiver
 * fora dos idiomas aceitos (antes da extração; em texto curto, o idioma é perguntado ao modelo), extrai a vaga e, se
 * for uma vaga relevante (palavras-chave), salva no MongoDB e anuncia para os canais. Cada post é processado uma
 * única vez.
 */
async function processPost(post: RawPost) {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	if (await resumeSavedJob(post.postId, { queue, logger })) {
		await markAsSeen(post, 'saved')
		return
	}

	const settings = await loadSettings('post-processing')

	// Antes do idioma: esses posts costumam misturar cargos em inglês; o idioma de cada vaga é visto na página dela
	const listings = post.sourcePostId ? null : splitMultiJobPost(post.text)
	if (listings) {
		await requestLookups(post, listings, settings)
		await markAsSeen(post, 'multi-job')
		return
	}

	const { language, rejection } = await checkLanguage(ollama, config.OLLAMA_MODEL, post.text, settings.allowedLanguages)

	if (rejection) {
		log.info({ reason: rejection }, 'Post descartado')
		await markAsSeen(post, 'language')
		return
	}

	log.info({ language, images: post.images.length }, 'Processando post')
	// Sem perfil, `targetRole` fica ausente e o modelo extrai a primeira vaga de um post com várias
	const { targetRole } = await readSettings('profile')
	const aiJob = await extractJobFromPost(ollama, config.OLLAMA_MODEL, post, targetRole ?? null)
	const reason = rejectionReason(aiJob)

	if (!aiJob || reason) {
		log.info({ reason }, 'Post descartado')
		await markAsSeen(post, 'not-a-job')
		return
	}

	const job = buildProcessedJob(post, aiJob, language)
	const irrelevant = relevanceRejection(job, settings)

	if (irrelevant) {
		log.info({ reason: irrelevant, title: job.title }, 'Vaga descartada')
		await markAsSeen(post, 'keywords')
		return
	}

	log.info({ extractionChecks: job.extractionChecks, title: job.title }, 'Vaga estruturada')
	const saved = await saveJob(
		job,
		{ queue, logger },
		{ extractionModel: config.OLLAMA_MODEL, promptVersion: extractionPromptVersion(post) },
		post.images,
	)
	await markAsSeen(post, saved ? 'saved' : 'missing-fields')
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
			postedAt: post.postedAt,
			requestedAt: new Date().toISOString(),
		}
		await queue.publish(QUEUES.scraperLookup, lookup)
		requested++
	}

	log.info({ listings: listings.length, requested }, '📋 Post com várias vagas: links enviados para o scraper abrir')
}

type KeywordSettings = { requiredKeywords: string[]; excludedKeywords: string[] }

/** Registra o destino do post (o histórico de coletas mostra os motivos de descarte); a IA o viu como vaga ou não. */
function markAsSeen(post: RawPost, outcome: SeenPostOutcome) {
	const isJob = outcome === 'saved' || outcome === 'keywords' || outcome === 'missing-fields'

	return SeenPost.updateOne({ postId: post.postId }, { $setOnInsert: { postId: post.postId, isJob, outcome } }, { upsert: true })
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
