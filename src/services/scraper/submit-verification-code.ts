/**
 * Envia o código de verificação que o LinkedIn pediu no login ao scraper em execução.
 * Uso: bun scraper:verify 123456
 */
import { loadConfig, rabbitmqEnv } from '@shared/config'
import { VerificationCodeSchema } from '@shared/contracts'
import { createLogger } from '@shared/logging'
import { QueueClient, QUEUES } from '@shared/messaging'

const logger = createLogger('scraper-cli')

const message = VerificationCodeSchema.safeParse({ code: process.argv[2] ?? '', requestedAt: new Date().toISOString() })
if (!message.success) {
	logger.error(`Código inválido: ${message.error.issues[0]?.message}. Uso: bun scraper:verify 123456`)
	process.exit(1)
}

const rabbitmq = loadConfig(rabbitmqEnv)

const queue = new QueueClient({
	url: rabbitmq.RABBITMQ_URL,
	maxRetries: rabbitmq.QUEUE_MAX_RETRIES,
	retryDelayMs: rabbitmq.QUEUE_RETRY_DELAY_MS,
	logger,
})

await queue.connect()
await queue.publish(QUEUES.scraperVerification, message.data)
await queue.close()

logger.info('Código enviado ao scraper; acompanhe os logs dele para ver se o login foi concluído')
