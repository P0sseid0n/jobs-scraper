import { DATE_POSTED_FILTERS, type DatePostedFilter } from '@shared/contracts'

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
 * Divide o mínimo de vagas da coleta entre os termos; o resto vai para os primeiros (10 em 3 → 4, 3, 3).
 * Com mais termos que vagas, os últimos ficam com 0.
 */
export function jobsPerTerm(minJobsPerRun: number, termCount: number) {
	const base = Math.floor(minJobsPerRun / termCount)
	const remainder = minJobsPerRun % termCount

	return Array.from({ length: termCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** Quantas coletas seguidas abaixo do mínimo dobram o intervalo: com 2 ou mais, ele fica no máximo 4 vezes maior. */
const MAX_STRETCH_STEPS = 2

/**
 * Quantas vezes o intervalo entre as coletas automáticas é esticado: dobra a cada coleta seguida (das mais recentes)
 * que terminou abaixo do mínimo de vagas, até 4 vezes. Coletar de novo logo depois de uma busca esgotada só acha
 * posts já vistos e aumenta o risco de bloqueio da conta.
 */
export function intervalStretch(shortRuns: number) {
	return 2 ** Math.min(shortRuns, MAX_STRETCH_STEPS)
}

/**
 * Calcula a próxima coleta automática: o intervalo (esticado por `shortRuns`, ver `intervalStretch`) após o início
 * da última, ou já se nunca coletou.
 */
export function nextRunAt(lastStartedAt: Date | null, intervalMinutes: number, shortRuns = 0) {
	if (!lastStartedAt) return new Date(0)

	return new Date(lastStartedAt.getTime() + intervalMinutes * intervalStretch(shortRuns) * 60_000)
}

/**
 * O período seguinte, mais amplo, para quando a busca acaba sem completar o mínimo de vagas (24h → semana → mês →
 * qualquer data); `null` se já é o mais amplo.
 */
export function widerDatePosted(datePosted: DatePostedFilter): DatePostedFilter | null {
	return DATE_POSTED_FILTERS[DATE_POSTED_FILTERS.indexOf(datePosted) + 1] ?? null
}

/**
 * Ordena os termos pelas vagas que trouxeram nas últimas coletas (`jobsByTerm`): com o mínimo completo cedo, os que
 * menos rendem é que ficam sem busca. Os termos sem histórico vêm primeiro, para terem a chance de mostrar o que trazem;
 * os empates mantêm a ordem das configurações.
 */
export function rankTerms(terms: string[], jobsByTerm: ReadonlyMap<string, number>) {
	const score = (term: string) => jobsByTerm.get(term) ?? Number.POSITIVE_INFINITY

	return terms.toSorted((a, b) => score(b) - score(a) || 0)
}
