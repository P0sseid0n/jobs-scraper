import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import { RawPostSchema, type RawPost } from '@shared/contracts'
import { SeenPost } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings } from '@shared/settings'

import { extractionEnv, listFromEnv } from './config'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'
import { relevanceRejection } from './job-relevance'
import { rejectionReason } from './model-response'
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

await queue.assertQueue(QUEUES.storage)
await queue.consume(QUEUES.postProcessing, RawPostSchema, processPost)

/**
 * Descarta o post se ele estiver fora dos idiomas aceitos (sem chamar a IA); senão extrai a vaga e, se for
 * uma vaga relevante (palavras-chave), envia ao storage. Cada post é processado uma única vez.
 */
async function processPost(post: RawPost) {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	const settings = await loadSettings('post-processing', settingsSeed)
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
		await queue.publish(QUEUES.storage, job)
		log.info({ aiJobConfidence: job.aiJobConfidence, title: job.title }, 'Vaga estruturada enviada para o storage')
	}

	await markAsSeen(post, true)
}

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
