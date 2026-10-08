import { Ollama } from 'ollama'

import { ollamaEnv } from '@shared/config'
import { RawPostSchema, type RawPost } from '@shared/contracts'
import { SeenPost } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadSettings } from '@shared/settings'

import { extractionEnv } from './config'
import { buildProcessedJob, extractJobFromPost } from './job-extraction'
import { rejectionReason } from './model-response'

const { config, logger, queue } = await startService({
	name: 'post-processing',
	env: { ...ollamaEnv, ...extractionEnv },
	database: true,
})

const ollama = new Ollama({ host: config.OLLAMA_HOST })
await ensureModelAvailable()

// Valor inicial da coleção `settings`; depois a confiança mínima é editável por outras fontes
const settingsSeed = { minJobConfidence: config.MIN_JOB_CONFIDENCE }
await loadSettings('post-processing', settingsSeed)

await queue.assertQueue(QUEUES.storage)
await queue.consume(QUEUES.postProcessing, RawPostSchema, processPost)

/** Extrai a vaga do post; se for uma vaga, envia para o storage. Cada post é processado uma única vez. */
async function processPost(post: RawPost) {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	log.info('Processando post')
	const aiJob = await extractJobFromPost(ollama, config.OLLAMA_MODEL, post)
	const { minJobConfidence } = await loadSettings('post-processing', settingsSeed)
	const reason = rejectionReason(aiJob, minJobConfidence)

	if (aiJob && !reason) {
		const job = buildProcessedJob(post, aiJob)
		await queue.publish(QUEUES.storage, job)

		log.info({ aiJobConfidence: job.aiJobConfidence, title: job.title }, 'Vaga estruturada enviada para o storage')
	} else {
		log.info({ reason, aiJobConfidence: aiJob?.aiJobConfidence }, 'Post descartado: não é vaga')
	}

	await SeenPost.updateOne({ postId: post.postId }, { $setOnInsert: { postId: post.postId, isJob: !reason } }, { upsert: true })
}

/** Sem o modelo baixado, todas as chamadas falhariam: melhor encerrar com uma instrução clara. */
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
