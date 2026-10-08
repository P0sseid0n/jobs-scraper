import pino, { type Logger } from 'pino'
import pretty from 'pino-pretty'

// Lido direto do process.env (e não de load-config.ts) para que o próprio carregamento da configuração possa logar erros de validação.
const level = process.env.LOG_LEVEL || 'info'
const usePretty = process.env.LOG_PRETTY === 'true'

const root = usePretty
	? pino({ level }, pretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }))
	: pino({ level })

export function createLogger(service: string): Logger {
	return root.child({ service })
}

export type { Logger }
