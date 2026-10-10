import type { z } from 'zod'

import { mongoEnv, rabbitmqEnv } from '../config/infrastructure-env'
import { loadConfig } from '../config/load-config'
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../database/connection'
import { startHeartbeat } from '../health/heartbeat'
import { onShutdown, setupGracefulShutdown } from '../lifecycle/graceful-shutdown'
import { createLogger } from '../logging/logger'
import { QueueClient } from '../messaging/queue-client'

type ServiceOptions<Env extends z.ZodRawShape> = {
	/** Nome usado nos logs. */
	name: string

	/** Variáveis de ambiente próprias do serviço (as do RabbitMQ são sempre carregadas). */
	env?: Env

	/** Conecta ao MongoDB (lendo `MONGO_URL`) antes de devolver o serviço. */
	database?: boolean
}

/** Inicializa o que todo serviço precisa: logger, encerramento gracioso, `.env`, MongoDB (opcional) e RabbitMQ. */
export async function startService<Env extends z.ZodRawShape = Record<never, never>>(options: ServiceOptions<Env>) {
	const logger = createLogger(options.name)
	setupGracefulShutdown(logger)

	const config = loadConfig({ ...rabbitmqEnv, ...(options.env ?? ({} as Env)) })
	const rabbitmq = loadConfig(rabbitmqEnv)

	if (options.database) {
		const { MONGO_URL } = loadConfig(mongoEnv)
		await connectDatabase(MONGO_URL, logger)
		onShutdown(disconnectDatabase)
	}

	const queue = new QueueClient({
		url: rabbitmq.RABBITMQ_URL,
		maxRetries: rabbitmq.QUEUE_MAX_RETRIES,
		retryDelayMs: rabbitmq.QUEUE_RETRY_DELAY_MS,
		logger,
	})

	await queue.connect()
	onShutdown(() => queue.close())

	const stopHeartbeat = startHeartbeat(() => queue.isConnected && (!options.database || isDatabaseConnected()))
	onShutdown(stopHeartbeat)

	return { config, logger, queue }
}
