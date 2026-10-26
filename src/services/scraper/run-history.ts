import { ScraperRun, type ScraperRunTerm, type ScraperRunTrigger } from '@shared/database'

import { LoginError } from './login'
import type { ScrapeResult } from './scrape-run'

/** Recebe os termos terminados até agora, a cada termo que termina. */
export type TermProgress = (terms: ScraperRunTerm[]) => Promise<void>

/**
 * Executa a coleta registrando-a em `scraper_runs` (em andamento → sucesso ou falha). Os termos previstos e o mínimo de
 * vagas (`plan`) e o resultado de cada termo, assim que ele termina, ficam gravados: o site mostra a coleta andando.
 * @returns O resultado por termo, o total enviado e se todas as buscas falharam.
 */
export async function recordRun(
	trigger: ScraperRunTrigger,
	plan: { terms: string[]; minJobs: number },
	collect: (onTerm: TermProgress) => Promise<ScrapeResult>,
) {
	const run = await ScraperRun.create({
		trigger,
		status: 'running',
		startedAt: new Date(),
		plannedTerms: plan.terms,
		minJobs: plan.minJobs,
	})

	// O andamento é só para o site: se não der para gravar, a coleta segue (o resultado final é gravado no fim)
	const onTerm: TermProgress = terms =>
		ScraperRun.updateOne({ _id: run._id }, { terms, sent: terms.reduce((total, term) => total + term.sent, 0) }).then(
			() => {},
			() => {},
		)

	try {
		const { terms, deferredLists } = await collect(onTerm)
		const sent = terms.reduce((total, term) => total + term.sent, 0)
		// Busca sem resultados não é falha: a coleta só falha se todos os termos quebraram de verdade
		const failed = terms.every(term => term.error && term.errorKind !== 'empty')

		await ScraperRun.updateOne(
			{ _id: run._id },
			{
				status: failed ? 'failed' : 'success',
				finishedAt: new Date(),
				terms,
				sent,
				deferredLists,
				error: failed ? 'Todas as buscas falharam' : null,
			},
		)

		return { terms, sent, failed }
	} catch (error) {
		await ScraperRun.updateOne(
			{ _id: run._id },
			{
				status: 'failed',
				finishedAt: new Date(),
				error: error instanceof Error ? error.message : String(error),
				loginFailure: error instanceof LoginError ? error.kind : null,
			},
		)

		throw error
	}
}

/** Marca como falha as coletas que ficaram em andamento porque o serviço foi encerrado no meio. */
export function markInterruptedRuns() {
	return ScraperRun.updateMany(
		{ status: 'running' },
		{ status: 'failed', finishedAt: new Date(), error: 'Coleta interrompida (o serviço foi encerrado no meio)' },
	)
}

export async function lastRunStartedAt() {
	const last = await ScraperRun.findOne({}, { startedAt: 1 }).sort({ startedAt: -1 }).lean()

	return last?.startedAt ?? null
}
