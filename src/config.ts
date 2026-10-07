import { z } from 'zod'
import { DATE_POSTED_FILTERS } from './services/scraper/linkedin'
import { createLogger } from './utils/logger'

const booleanFromEnv = z.enum(['true', 'false']).transform(value => value === 'true')

export const rabbitmqEnv = {
	RABBITMQ_URL: z.string().startsWith('amqp'),
	QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
	QUEUE_RETRY_DELAY_MS: z.coerce.number().int().positive().default(5_000),
}

export const mongoEnv = {
	MONGO_URL: z.string().startsWith('mongodb'),
}

export const ollamaEnv = {
	OLLAMA_HOST: z.url().default('http://localhost:11434'),
	OLLAMA_MODEL: z.string().min(1).default('gemma3:4b'),
	/** Posts com confiança da IA abaixo disso são descartados (não viram vaga). */
	MIN_JOB_CONFIDENCE: z.coerce.number().min(0).max(100).default(60),
}

export const linkedinEnv = {
	LINKEDIN_EMAIL: z.email(),
	LINKEDIN_PASSWORD: z.string().min(1),
	LINKEDIN_LI_AT: z.string().optional(),
	HEADLESS: booleanFromEnv.default(false),
	BROWSER_NO_SANDBOX: booleanFromEnv.default(false),
	SEARCH_KEYWORDS: z.string().trim().min(1).default('Front End Vue'),
	SCRAPER_DATE_POSTED: z.enum(DATE_POSTED_FILTERS).default('past-24h'),
	SCRAPER_MAX_POSTS: z.coerce.number().int().positive().default(50),
	/** Tempo máximo esperando novos posts aparecerem depois de rolar a página. */
	SCRAPER_SCROLL_DELAY_MS: z.coerce.number().int().min(1_000).default(10_000),
	/** 0 = roda uma vez e termina; > 0 = repete a coleta a cada N minutos. */
	SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
}

export const discordEnv = {
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CHANNEL_ID: z.string().regex(/^\d+$/, 'deve ser o ID numérico do canal'),
}

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
