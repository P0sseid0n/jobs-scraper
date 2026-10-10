import { z } from 'zod'

import { booleanFromEnv } from '@shared/config'
import { DATE_POSTED_FILTERS } from '@shared/contracts'

export const HEADLESS_MODES = ['auto', 'true', 'false'] as const
export type HeadlessMode = (typeof HEADLESS_MODES)[number]

export const scraperEnv = {
	// Conta do LinkedIn
	LINKEDIN_EMAIL: z.email(),
	LINKEDIN_PASSWORD: z.string().min(1),
	LINKEDIN_LI_AT: z.string().optional(),
	/** Sessão do LinkedIn salva entre execuções (cookies), para não precisar logar toda vez. */
	LINKEDIN_COOKIES_FILE: z.string().min(1).default('data/scraper/linkedin-cookies.json'),

	// Navegador
	/**
	 * `auto`: sem janela, e abre uma só se o LinkedIn pedir uma verificação que o terminal não resolve (ex.: captcha).
	 * `true`: nunca abre janela (Docker/servidor). `false`: sempre com janela.
	 */
	HEADLESS: z.enum(HEADLESS_MODES).default('auto'),
	BROWSER_NO_SANDBOX: booleanFromEnv.default(false),

	// Busca e limites: só os valores iniciais. Depois valem os da coleção `settings` (editável por outras fontes)
	/** Termos de busca separados por vírgula; cada um vira uma busca na mesma coleta. */
	SEARCH_KEYWORDS: z.string().trim().min(1).default('Front End Vue'),
	SCRAPER_DATE_POSTED: z.enum(DATE_POSTED_FILTERS).default('past-24h'),
	SCRAPER_MAX_POSTS: z.coerce.number().int().positive().default(50),
	/**
	 * 0 = roda uma coleta e termina. > 0 = fica rodando: coleta a cada N minutos e atende o "coletar agora"
	 * (fila `scraper`). Com o serviço rodando, o intervalo passa a ser o da coleção `settings`.
	 */
	SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),

	/** Tempo máximo esperando novos posts aparecerem depois de rolar a página. */
	SCRAPER_SCROLL_DELAY_MS: z.coerce.number().int().min(1_000).default(10_000),
}

export type ScraperConfig = z.infer<z.ZodObject<typeof scraperEnv>>
