import { z } from 'zod'

import { booleanFromEnv } from '@shared/config'

import { DATE_POSTED_FILTERS } from './linkedin/urls'

export const scraperEnv = {
	// Conta do LinkedIn
	LINKEDIN_EMAIL: z.email(),
	LINKEDIN_PASSWORD: z.string().min(1),
	LINKEDIN_LI_AT: z.string().optional(),
	/** Sessão do LinkedIn salva entre execuções (cookies), para não precisar logar toda vez. */
	LINKEDIN_COOKIES_FILE: z.string().min(1).default('data/scraper/linkedin-cookies.json'),

	// Navegador
	HEADLESS: booleanFromEnv.default(false),
	BROWSER_NO_SANDBOX: booleanFromEnv.default(false),

	// Busca e limites por execução
	SEARCH_KEYWORDS: z.string().trim().min(1).default('Front End Vue'),
	SCRAPER_DATE_POSTED: z.enum(DATE_POSTED_FILTERS).default('past-24h'),
	SCRAPER_MAX_POSTS: z.coerce.number().int().positive().default(50),
	/** Tempo máximo esperando novos posts aparecerem depois de rolar a página. */
	SCRAPER_SCROLL_DELAY_MS: z.coerce.number().int().min(1_000).default(10_000),
	/** 0 = roda uma vez e termina; > 0 = repete a coleta a cada N minutos. */
	SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
}

export type ScraperConfig = z.infer<z.ZodObject<typeof scraperEnv>>
