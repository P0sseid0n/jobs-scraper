import { loadConfig, mongoEnv, rabbitmqEnv } from '../../config'
import { ProcessedJobSchema } from '../../types/messages'
import { connectDatabase, disconnectDatabase, Job } from '../../utils/db'
import { createLogger } from '../../utils/logger'
import { QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown } from '../../utils/shutdown'
import { missingRequiredFields } from './validation'

const logger = createLogger('storage')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...mongoEnv })

// Salvar no Mongo é rápido e o upsert é idempotente: dá para processar várias mensagens em paralelo
const PREFETCH = 10

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

await queue.consume(
	QUEUES.storage,
	ProcessedJobSchema,
	async data => {
		const log = logger.child({ postId: data.postId })

		const missing = missingRequiredFields(data)
		if (missing.length > 0) {
			log.warn({ missing }, 'Vaga sem os campos obrigatórios, descartando')
			return
		}

		// Upsert idempotente: a mesma vaga nunca é salva duas vezes, mesmo se a mensagem for reprocessada.
		const job = await Job.findOneAndUpdate(
			{ postId: data.postId },
			{ $setOnInsert: data },
			{ upsert: true, returnDocument: 'after' },
		)

		if (job.notifiedAt) {
			log.info('Vaga já salva e anunciada anteriormente, ignorando')
			return
		}

		await queue.publish(QUEUES.discord, data)
		await Job.updateOne({ postId: data.postId }, { notifiedAt: new Date() })
		log.info('Vaga salva no MongoDB e enviada para o Discord')
	},
	{ prefetch: PREFETCH },
)
