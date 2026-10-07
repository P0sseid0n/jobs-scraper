import type { Logger } from './logger'

type Cleanup = () => Promise<unknown> | unknown

const cleanups: Cleanup[] = []
let shuttingDown = false

const SHUTDOWN_TIMEOUT_MS = 15_000

/** Registra uma função de limpeza. Elas rodam na ordem inversa do registro ao receber SIGINT/SIGTERM. */
export function onShutdown(cleanup: Cleanup) {
	cleanups.push(cleanup)
}

export async function shutdown(logger: Logger, exitCode = 0) {
	if (shuttingDown) return
	shuttingDown = true
	logger.info('Encerrando...')

	const timeout = setTimeout(() => {
		logger.error('Timeout no encerramento, forçando saída')
		process.exit(1)
	}, SHUTDOWN_TIMEOUT_MS)

	for (const cleanup of cleanups.toReversed()) {
		try {
			await cleanup()
		} catch (error) {
			logger.error({ err: error }, 'Erro durante o encerramento')
		}
	}

	clearTimeout(timeout)
	process.exit(exitCode)
}

export function setupGracefulShutdown(logger: Logger) {
	process.once('SIGINT', () => shutdown(logger))
	process.once('SIGTERM', () => shutdown(logger))
	process.on('unhandledRejection', error => {
		logger.fatal({ err: error }, 'Promise rejeitada sem tratamento')
		shutdown(logger, 1)
	})
	process.on('uncaughtException', error => {
		logger.fatal({ err: error }, 'Exceção não tratada')
		shutdown(logger, 1)
	})
}
