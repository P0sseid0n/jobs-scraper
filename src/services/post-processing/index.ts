import { Ollama } from 'ollama'
import { loadConfig, mongoEnv, ollamaEnv, rabbitmqEnv } from '../../config'
import { type ProcessedJob, RawPostSchema } from '../../types/messages'
import { connectDatabase, disconnectDatabase, SeenPost } from '../../utils/db'
import { createLogger } from '../../utils/logger'
import { PermanentError, QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown } from '../../utils/shutdown'
import { linkFromText, parseModelResponse, rejectionReason } from './parse'
import { buildMessages, MODEL_OUTPUT_FORMAT } from './prompt'

const logger = createLogger('post-processing')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...mongoEnv, ...ollamaEnv })

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
await queue.assertQueue(QUEUES.storage)

await queue.consume(QUEUES.postProcessing, RawPostSchema, async post => {
	const log = logger.child({ postId: post.postId })

	if (await SeenPost.exists({ postId: post.postId })) {
		log.info('Post já processado anteriormente, ignorando')
		return
	}

	// NFKC converte o "negrito" Unicode comum no LinkedIn (𝐕𝐮𝐞.𝐣𝐬) em texto normal, que o modelo entende melhor
	const text = post.text.normalize('NFKC')

	log.info('Processando post')
	// Erros do Ollama (fora do ar, timeout) são transitórios: o QueueClient tenta de novo
	const response = await ollama.chat({
		model: config.OLLAMA_MODEL,
		messages: buildMessages({ text, author: post.author }),
		format: MODEL_OUTPUT_FORMAT,
		options: { temperature: 0 },
	})
	log.debug({ response: response.message.content }, 'Resposta bruta do modelo')

	let aiJob: ReturnType<typeof parseModelResponse>
	try {
		aiJob = parseModelResponse(response.message.content)
	} catch (error) {
		// Com structured outputs isso não deveria acontecer; se acontecer, tentar de novo não ajuda
		throw new PermanentError('Resposta do modelo inválida', { cause: error })
	}

	const reason = rejectionReason(aiJob, config.MIN_JOB_CONFIDENCE)

	if (aiJob && !reason) {
		const job: ProcessedJob = {
			postId: post.postId,
			rawContent: post.text,
			title: aiJob.title,
			company: aiJob.company,
			location: aiJob.location,
			// O link real do post tem prioridade; o da IA só vale se estiver escrito no texto
			link: post.url ?? linkFromText(aiJob.link, text),
			necessary_knowledge: aiJob.necessary_knowledge,
			recruiter_email: aiJob.recruiter_email,
			workMode: aiJob.workMode,
			aiJobConfidence: aiJob.aiJobConfidence,
			postedAt: post.postedAt,
			author: post.author,
		}
		await queue.publish(QUEUES.storage, job)
		log.info({ aiJobConfidence: job.aiJobConfidence, title: job.title }, 'Vaga estruturada enviada para o storage')
	} else {
		log.info({ reason, aiJobConfidence: aiJob?.aiJobConfidence }, 'Post descartado: não é vaga')
	}

	await SeenPost.updateOne({ postId: post.postId }, { $setOnInsert: { postId: post.postId, isJob: !reason } }, { upsert: true })
})
