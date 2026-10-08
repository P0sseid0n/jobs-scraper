import type { SettingsInput } from '@shared/contracts'

import type { ScraperConfig } from './config'

/** Converte o `.env` nos valores iniciais da coleção `settings` (usados só na primeira execução). */
export function settingsSeedFromEnv(config: ScraperConfig): Partial<SettingsInput<'scraper'>> {
	const terms = [...new Set(config.SEARCH_KEYWORDS.split(',').map(term => term.trim()))].filter(Boolean)

	return {
		searchTerms: terms.map(term => ({ term, enabled: true })),
		datePosted: config.SCRAPER_DATE_POSTED,
		maxPostsPerRun: config.SCRAPER_MAX_POSTS,
		// Com 0 (execução única) o intervalo não é usado: fica o padrão para quando o serviço rodar continuamente
		...(config.SCRAPER_INTERVAL_MINUTES > 0 ? { intervalMinutes: config.SCRAPER_INTERVAL_MINUTES } : {}),
	}
}

/**
 * Divide o limite da coleta entre os termos sem ultrapassá-lo; o resto vai para os primeiros (50 em 3 → 17, 17, 16).
 * Com mais termos que posts, os últimos ficam com 0.
 */
export function postsPerTerm(maxPostsPerRun: number, termCount: number) {
	const base = Math.floor(maxPostsPerRun / termCount)
	const remainder = maxPostsPerRun % termCount

	return Array.from({ length: termCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** Calcula a próxima coleta automática: `intervalMinutes` após o início da última, ou já se nunca coletou. */
export function nextRunAt(lastStartedAt: Date | null, intervalMinutes: number) {
	if (!lastStartedAt) return new Date(0)

	return new Date(lastStartedAt.getTime() + intervalMinutes * 60_000)
}
