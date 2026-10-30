import mongoose from 'mongoose'

import type { ScraperRunEvent } from '@shared/contracts'
import {
	INTERRUPTED_RUN_ERROR,
	Job,
	RUN_HEARTBEAT_MS,
	RUN_STALE_MS,
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
 * início e o fim também são anunciados no evento `scraper-run`, para o site atualizar na hora. Sem conseguir gravar o
 * sinal de vida por `RUN_STALE_MS` (MongoDB fora do ar), a coleta é interrompida pelo `signal` de `collect`.
 * @returns O resultado por termo, o total enviado e se todas as buscas falharam.
 */
export async function recordRun(
	trigger: ScraperRunTrigger,
	plan: { terms: string[]; minJobs: number },
	{ queue, logger }: { queue: QueueClient; logger: Logger },
	collect: (onTerm: TermProgress, signal: AbortSignal) => Promise<ScrapeResult>,
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

	// O último sinal de vida gravado, o mesmo `progressAt` que o site lê
	let progressAt = startedAt
	const interrupted = new AbortController()

	// Falha ao gravar (MongoDB fora do ar) é ignorada: o próximo sinal tenta de novo
	const saveProgress = (update: Record<string, unknown> = {}) => {
		const at = new Date()
		return ScraperRun.updateOne({ _id: run._id, status: 'running' }, { ...update, progressAt: at }).then(
			() => {
				progressAt = at
			},
			() => {},
		)
	}

	// O andamento é só para o site: se não der para gravar, a coleta segue (o resultado final é gravado no fim)
	const onTerm: TermProgress = terms => saveProgress({ terms, sent: terms.reduce((total, term) => total + term.sent, 0) })

	// O sinal de vida: um termo pode levar minutos, e sem ele o site acharia a coleta interrompida. Sem sinal gravado há
	// `RUN_STALE_MS`, o site já a mostra interrompida: ela para de vez, em vez de voltar a aparecer quando o MongoDB voltar
	const beat = () => {
		if (interrupted.signal.aborted) return
		if (Date.now() - progressAt.getTime() < RUN_STALE_MS) return void saveProgress()

		logger.error({ lastProgressAt: progressAt }, 'Coleta interrompida: o MongoDB ficou fora do ar por tempo demais')
		interrupted.abort(new Error(INTERRUPTED_RUN_ERROR))
	}
	const heartbeat = setInterval(beat, RUN_HEARTBEAT_MS)
	// Ao reconectar, o sinal vai na hora: o site não chega a mostrar como interrompida a coleta que ainda está no prazo
	mongoose.connection.on('reconnected', beat)

	try {
		const collected = await collect(onTerm, interrupted.signal)
		interrupted.signal.throwIfAborted()

		const { terms, deferredLists, missingJobs } = collected
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
		if (interrupted.signal.aborted) {
			markInterruptedRun(run._id)
			await announce({ runId, phase: 'finished', status: 'failed', trigger })

			throw interrupted.signal.reason
		}

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
		mongoose.connection.off('reconnected', beat)
	}
}

/** Marca a coleta como interrompida; com o MongoDB ainda fora do ar, quando ele voltar. */
function markInterruptedRun(id: mongoose.Types.ObjectId) {
	markInterruptedRuns({ _id: id }).catch(() => mongoose.connection.once('reconnected', () => markInterruptedRun(id)))
}

/**
 * Marca como falha as coletas que ficaram em andamento porque o serviço ou o MongoDB caiu no meio. O fim é a última
 * gravação da coleta (sem ela, nas coletas antigas, o início): a hora em que o serviço voltou contaria o tempo parado.
 */
export function markInterruptedRuns(filter: { _id?: mongoose.Types.ObjectId } = {}) {
	return ScraperRun.updateMany(
		{ ...filter, status: 'running' },
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
