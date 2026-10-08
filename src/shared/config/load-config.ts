import { z } from 'zod'

import { createLogger } from '../logging/logger'

export const booleanFromEnv = z.enum(['true', 'false']).transform(value => value === 'true')

export function parseConfig<T extends z.ZodRawShape>(shape: T, env: Record<string, string | undefined>) {
	return z.object(shape).safeParse(env)
}

/** Valida as variáveis de ambiente do serviço e encerra o processo com uma mensagem clara se algo estiver errado. */
export function loadConfig<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>> {
	const result = parseConfig(shape, process.env)

	if (!result.success) {
		const issues = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
		createLogger('config').fatal({ issues }, 'Variáveis de ambiente inválidas ou ausentes (veja o .env.example)')
		process.exit(1)
	}

	return result.data
}
