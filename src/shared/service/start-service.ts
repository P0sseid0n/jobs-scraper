import type { z } from 'zod'

import { mongoEnv, rabbitmqEnv } from '../config/infrastructure-env'
import { loadConfig } from '../config/load-config'
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../database/connection'
import { startHeartbeat } from '../health/heartbeat'
import { onShutdown, setupGracefulShutdown } from '../lifecycle/graceful-shutdown'
import { createLogger } from '../logging/logger'
import { QueueClient } from '../messaging/queue-client'
import { settingsEnv, settingsSeedsFromEnv } from '../settings/settings-env'
import { seedSettings } from '../settings/settings-store'

type ServiceOptions<Env extends z.ZodRawShape> = {
	/** Nome usado nos logs. */
	name: string

	/** Variáveis de ambiente próprias do serviço (as do RabbitMQ são sempre carregadas). */
	env?: Env

	/**
	 * Conecta ao MongoDB (lendo `MONGO_URL`) antes de devolver o serviço, e grava as configurações que ainda não existem
	 * com os valores do `.env` (antes de qualquer leitura delas).
	 */
	database?: boolean
}

/**
 * Inicializa o que todo serviço precisa: logger, encerramento gracioso, `.env`, MongoDB (opcional, com as configurações
 * iniciais do `.env`) e RabbitMQ.
 */
export async function startService<Env extends z.ZodRawShape = Record<never, never>>(options: ServiceOptions<Env>) {
	const logger = createLogger(options.name)
	setupGracefulShutdown(logger)

	const config = loadConfig({ ...rabbitmqEnv, ...(options.env ?? ({} as Env)) })
	const rabbitmq = loadConfig(rabbitmqEnv)

	if (options.database) {
		const { MONGO_URL } = loadConfig(mongoEnv)
		const seeds = settingsSeedsFromEnv(loadConfig(settingsEnv))
		await connectDatabase(MONGO_URL, logger)
		onShutdown(disconnectDatabase)

		// O `.env` é a primeira fonte das configurações: qualquer serviço que subir primeiro grava os valores dele
		try {
			await seedSettings(seeds)
		} catch (error) {
			logger.fatal({ err: error }, 'Configurações iniciais do .env inválidas (veja o .env.example)')
			process.exit(1)
		}
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
