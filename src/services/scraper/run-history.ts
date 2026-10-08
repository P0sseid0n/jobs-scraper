import { ScraperRun, type ScraperRunTerm, type ScraperRunTrigger } from '@shared/database'

/**
 * Executa a coleta registrando-a em `scraper_runs` (em andamento → sucesso ou falha).
 * @returns O resultado por termo, o total enviado e se todas as buscas falharam.
 */
export async function recordRun(trigger: ScraperRunTrigger, collect: () => Promise<ScraperRunTerm[]>) {
	const run = await ScraperRun.create({ trigger, status: 'running', startedAt: new Date() })

	try {
		const terms = await collect()
		const sent = terms.reduce((total, term) => total + term.sent, 0)
		const failed = terms.every(term => term.error)

		await ScraperRun.updateOne(
			{ _id: run._id },
			{
				status: failed ? 'failed' : 'success',
				finishedAt: new Date(),
				terms,
				sent,
				error: failed ? 'Todas as buscas falharam' : null,
			},
		)

		return { terms, sent, failed }
	} catch (error) {
		await ScraperRun.updateOne(
			{ _id: run._id },
			{ status: 'failed', finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
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
