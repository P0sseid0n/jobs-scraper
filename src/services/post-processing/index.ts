import { Ollama } from 'ollama'
import { loadConfig, mongoEnv, ollamaEnv, rabbitmqEnv } from '../../config'
import { type ProcessedJob, RawPostSchema } from '../../types/messages'
import { connectDatabase, disconnectDatabase, SeenPost } from '../../utils/db'
import { createLogger } from '../../utils/logger'
import { QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown } from '../../utils/shutdown'
import { parseModelResponse } from './parse'

const logger = createLogger('post-processing')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...mongoEnv, ...ollamaEnv })

const expectedResponse = `{
            "title": "string",
            "company": "string",
            "location": "string",
            "link": "string",
            "necessary_knowledge": ["string"],
            "recruiter_email": "string",
            "workMode": "remoto | presencial | hibrido",
            "aiJobConfidence": 0
        }`.replace(/\n/g, '')

const ollama = new Ollama({ host: config.OLLAMA_HOST })

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

await ensureModelAvailable()
await connectDatabase(config.MONGO_URL, logger)
onShutdown(disconnectDatabase)

const queue = new QueueClient({
	url: config.RABBITMQ_URL,
	maxRetries: config.QUEUE_MAX_RETRIES,
	retryDelayMs: config.QUEUE_RETRY_DELAY_MS,
	logger,
})
await queue.connect()
onShutdown(() => queue.close())

await queue.consume(QUEUES.postProcessing, RawPostSchema, async post => {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	log.info('Processando post')
	const response = await ollama.chat({
		model: config.OLLAMA_MODEL,
		messages: [
			{
				role: 'user',
				content: `Leia a seguinte postagem e retorne **exatamente um único JSON em uma única linha**, sem explicações nem texto extra. O formato do JSON deve ser este: ${expectedResponse}.`,
			},
			{
				role: 'user',
				content: `Se **menos de 3 campos puderem ser preenchidos**, retorne **apenas a palavra: null**. Não escreva nenhum outro texto além de "null".`,
			},
			{
				role: 'user',
				content: `Preencha os campos ausentes com **null**. O campo "aiJobConfidence" deve conter um número de 0 a 100 representando sua certeza de que a postagem é uma vaga de emprego.`,
			},
			{
				role: 'user',
				content: post.text,
			},
		],
	})

	log.debug({ response: response.message.content }, 'Resposta bruta do modelo')
	const aiJob = parseModelResponse(response.message.content)

	if (aiJob) {
		const job: ProcessedJob = { ...aiJob, postId: post.postId, rawContent: post.text }
		await queue.publish(QUEUES.storage, job)
		log.info({ aiJobConfidence: job.aiJobConfidence }, 'Vaga estruturada enviada para o storage')
	} else {
		log.info('Modelo indicou que o post não é uma vaga')
	}

	await SeenPost.updateOne(
		{ postId: post.postId },
		{ $setOnInsert: { postId: post.postId, isJob: aiJob !== null } },
		{ upsert: true },
	)
})
