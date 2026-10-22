import pino, { type Logger } from 'pino'
import pretty from 'pino-pretty'

// Lido direto do process.env (e não de load-config.ts) para que o próprio carregamento da configuração possa logar erros de validação.
const level = process.env.LOG_LEVEL || 'info'
const usePretty = process.env.LOG_PRETTY === 'true'

/**
 * Segunda proteção para as credenciais: nenhum código loga segredos, mas um campo com um destes nomes (no objeto do log
 * ou um nível abaixo) sai como "[oculto]".
 */
const SECRET_KEYS = ['password', 'token', 'liAt', 'credentials']
export const REDACT_PATHS = SECRET_KEYS.flatMap(key => [key, `*.${key}`])

const options = { level, redact: { paths: REDACT_PATHS, censor: '[oculto]' } }

const root = usePretty ? pino(options, pretty({ colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' })) : pino(options)

export function createLogger(service: string): Logger {
	return root.child({ service })
}

export type { Logger }
