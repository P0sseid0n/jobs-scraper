import { z } from 'zod'

import { booleanFromEnv } from '@shared/config'
import { settingsEnv } from '@shared/settings'

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

	// A busca e os limites ficam nas configurações (`settingsEnv`); o intervalo também decide o modo de execução
	SCRAPER_INTERVAL_MINUTES: settingsEnv.SCRAPER_INTERVAL_MINUTES,

	/** Tempo máximo esperando novos posts aparecerem depois de rolar a página. */
	SCRAPER_SCROLL_DELAY_MS: z.coerce.number().int().min(1_000).default(10_000),

	/**
	 * Pausa mínima depois de abrir o link de uma vaga de um post com várias (a pausa real fica entre 1x e 2x).
	 * As vagas são abertas uma por vez, fora das coletas: quanto maior, menor o risco de bloqueio da conta.
	 */
	SCRAPER_LOOKUP_DELAY_MS: z.coerce.number().int().min(5_000).default(30_000),
}

export type ScraperConfig = z.infer<z.ZodObject<typeof scraperEnv>>
