/**
 * Pede uma coleta agora ao scraper em execução (outras fontes podem fazer o mesmo publicando na fila `scraper`).
 * Uso: bun scraper:run
 */
import { loadConfig, rabbitmqEnv } from '@shared/config'
import type { ScraperCommand } from '@shared/contracts'
import { createLogger } from '@shared/logging'
import { QueueClient, QUEUES } from '@shared/messaging'

const logger = createLogger('scraper-cli')
const rabbitmq = loadConfig(rabbitmqEnv)

const queue = new QueueClient({
	url: rabbitmq.RABBITMQ_URL,
	maxRetries: rabbitmq.QUEUE_MAX_RETRIES,
	retryDelayMs: rabbitmq.QUEUE_RETRY_DELAY_MS,
	logger,
})

const command: ScraperCommand = { command: 'run-now', requestedBy: 'cli', requestedAt: new Date().toISOString() }

await queue.connect()
await queue.publish(QUEUES.scraper, command)
await queue.close()

logger.info('Coleta solicitada; o scraper precisa estar rodando com SCRAPER_INTERVAL_MINUTES > 0')
