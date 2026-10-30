import type { ScraperRunEvent } from '@shared/contracts'
import {
	INTERRUPTED_RUN_ERROR,
	Job,
	RUN_HEARTBEAT_MS,
	ScraperRun,
	type ScraperRunTerm,
	type ScraperRunTrigger,
} from '@shared/database'
import type { Logger } from '@shared/logging'
import { EXCHANGES, type QueueClient } from '@shared/messaging'

import { LoginError } from './login'
import type { ScrapeResult } from './scrape-run'

/** Recebe os termos terminados até agora, a cada termo que termina. */
export type TermProgress = (terms: ScraperRunTerm[]) => Promise<void>

/**
 * Executa a coleta registrando-a em `scraper_runs` (em andamento → sucesso ou falha). Os termos previstos e o mínimo de
 * vagas (`plan`) e o resultado de cada termo, assim que ele termina, ficam gravados: o site mostra a coleta andando. O
 * início e o fim também são anunciados no evento `scraper-run`, para o site atualizar na hora.
 * @returns O resultado por termo, o total enviado e se todas as buscas falharam.
 */
export async function recordRun(
	trigger: ScraperRunTrigger,
	plan: { terms: string[]; minJobs: number },
	{ queue, logger }: { queue: QueueClient; logger: Logger },
	collect: (onTerm: TermProgress) => Promise<ScrapeResult>,
) {
	const startedAt = new Date()
	const run = await ScraperRun.create({
		trigger,
		status: 'running',
		startedAt,
		progressAt: startedAt,
		plannedTerms: plan.terms,
		minJobs: plan.minJobs,
	})
	const runId = run._id.toString()

	// O anúncio também é só para o site, que se corrige na próxima consulta: se não der para publicar (ex.: o site nunca
	// subiu e nenhuma fila assina o evento), a coleta segue
	const announce = (event: ScraperRunEvent) =>
		queue
			.publishEvent(EXCHANGES.scraperRun, event)
			.catch(error => logger.debug({ err: error, event }, 'Coleta não anunciada no evento scraper-run'))

	await announce({ runId, phase: 'started', status: 'running', trigger })

	// O andamento é só para o site: se não der para gravar, a coleta segue (o resultado final é gravado no fim)
	const onTerm: TermProgress = terms =>
		ScraperRun.updateOne(
			{ _id: run._id },
			{ terms, sent: terms.reduce((total, term) => total + term.sent, 0), progressAt: new Date() },
		).then(
			() => {},
			() => {},
		)

	// O sinal de vida: um termo pode levar minutos, e sem ele o site acharia a coleta interrompida (`RUN_STALE_MS`). Falha
	// ao gravar (MongoDB fora do ar) é ignorada: o próximo sinal tenta de novo
	const heartbeat = setInterval(
		() => void ScraperRun.updateOne({ _id: run._id, status: 'running' }, { progressAt: new Date() }).catch(() => {}),
		RUN_HEARTBEAT_MS,
	)

	try {
		const { terms, deferredLists, missingJobs } = await collect(onTerm)
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
				missingJobs,
				error: failed ? 'Todas as buscas falharam' : null,
			},
		)
		await announce({ runId, phase: 'finished', status: failed ? 'failed' : 'success', trigger })

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
		await announce({ runId, phase: 'finished', status: 'failed', trigger })

		throw error
	} finally {
		clearInterval(heartbeat)
	}
}

/**
 * Marca como falha as coletas que ficaram em andamento porque o serviço ou o MongoDB caiu no meio. O fim é a última
 * gravação da coleta (sem ela, nas coletas antigas, o início): a hora em que o serviço voltou contaria o tempo parado.
 */
export function markInterruptedRuns() {
	return ScraperRun.updateMany(
		{ status: 'running' },
		[
			{
				$set: {
					status: 'failed',
					finishedAt: { $ifNull: ['$progressAt', '$startedAt'] },
					error: INTERRUPTED_RUN_ERROR,
				},
			},
		],
		{ updatePipeline: true },
	)
}

export async function lastRunStartedAt() {
	const last = await ScraperRun.findOne({}, { startedAt: 1 }).sort({ startedAt: -1 }).lean()

	return last?.startedAt ?? null
}

/** Coletas recentes que contam no rendimento de cada termo (ver `rankTerms`). */
const YIELD_RUNS = 10

/**
 * Vagas que cada termo trouxe nas últimas coletas (as de listas de vagas contam pelo post da lista). Só entram os
 * termos que chegaram a buscar: um termo pulado ou com a busca quebrada fica sem histórico.
 */
export async function jobsByTerm() {
	const runs = await ScraperRun.find({ status: 'success' }, { terms: 1 }).sort({ startedAt: -1 }).limit(YIELD_RUNS).lean()
	const postIdsByTerm = new Map<string, string[]>()

	for (const term of runs.flatMap(run => run.terms)) {
		if (term.error || !term.postIds || term.sent + term.skipped + term.otherLanguage === 0) continue
		postIdsByTerm.set(term.term, [...(postIdsByTerm.get(term.term) ?? []), ...term.postIds])
	}

	const postIds = [...postIdsByTerm.values()].flat()
	const jobs = await Job.find(
		{ $or: [{ postId: { $in: postIds } }, { sourcePostId: { $in: postIds } }] },
		{ postId: 1, sourcePostId: 1 },
	).lean()
	const jobPosts = jobs.map(job => job.sourcePostId ?? job.postId)

	return new Map(
		[...postIdsByTerm].map(([term, ids]) => {
			const own = new Set(ids)
			return [term, jobPosts.filter(postId => own.has(postId)).length]
		}),
	)
}
