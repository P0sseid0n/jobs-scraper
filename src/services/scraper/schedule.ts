/** Por que o scraper não coleta enquanto nenhum termo de busca está ativo (registrado no log). */
export const NO_SEARCH_TERMS =
	'Nenhum termo de busca ativo: as coletas ficam em espera até você configurar os termos no site (Configurações)'

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
