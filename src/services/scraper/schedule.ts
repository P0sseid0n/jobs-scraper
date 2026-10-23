/** Por que o scraper não coleta enquanto nenhum termo de busca está ativo (registrado no log). */
export const NO_SEARCH_TERMS =
	'Nenhum termo de busca ativo: as coletas ficam em espera até você configurar os termos no site (Configurações)'

/** Por que o scraper espera a primeira coleta numa instalação nova (registrado no log). */
export const AWAITING_FIRST_RUN =
	'Instalação nova: a primeira coleta espera o fim do onboarding ("fazer a primeira coleta" no site) ou o "coletar agora"'

/** Por que as coletas automáticas estão em espera; `null` quando elas seguem o intervalo. */
export type WaitingReason = 'paused' | 'no-terms' | 'no-account' | 'first-run'

/**
 * O motivo de as coletas automáticas não rodarem: pausadas, sem termos de busca ativos, sem conta do LinkedIn ou, numa
 * instalação que nunca coletou (`awaitingFirstRun`), esperando a primeira ser pedida pelo site. Sem termos ou sem
 * conta, a coleta não teria o que fazer; o scraper espera a configuração em vez de falhar.
 */
export function waitingReason(options: {
	paused: boolean
	activeSearchTerms: number
	hasAccount: boolean
	awaitingFirstRun?: boolean
}): WaitingReason | null {
	if (options.paused) return 'paused'
	if (options.activeSearchTerms === 0) return 'no-terms'
	if (!options.hasAccount) return 'no-account'
	if (options.awaitingFirstRun) return 'first-run'
	return null
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
