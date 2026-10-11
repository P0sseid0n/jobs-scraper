import { z } from 'zod'

import type { ScraperCommand } from '@shared/contracts'
import { ScraperRun, type ScraperRunStatus, type ScraperRunTerm, type ScraperRunTrigger } from '@shared/database'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { nextRunAt } from '../../scraper/schedule'
import type { RunsPage, ScraperStatus, WebScraperRun } from '../api-types'
import { decodeCursor, encodeCursor, HttpError, queryParams } from './http'
import { afterCursor } from './jobs-query'
import { readSettings } from './settings'

const RunsQuerySchema = z.object({
	cursor: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
})

type RunDocument = {
	_id: unknown
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: Date
	finishedAt: Date | null
	sent: number
	terms: ScraperRunTerm[]
	error: string | null
}

/** `GET /api/scraper/status`: coleta em andamento, última coleta e próxima agendada. */
export async function scraperStatus() {
	const [current, last, settings] = await Promise.all([
		ScraperRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean(),
		ScraperRun.findOne({ status: { $ne: 'running' } })
			.sort({ startedAt: -1 })
			.lean(),
		readSettings('scraper'),
	])

	// Mesma conta do scraper: intervalo a partir do início da última coleta (em andamento ou não)
	const lastStartedAt = current?.startedAt ?? last?.startedAt ?? null
	const next = settings.paused ? null : nextRunAt(lastStartedAt, settings.intervalMinutes)

	return Response.json({
		current: current ? toWebRun(current) : null,
		last: last ? toWebRun(last) : null,
		nextRunAt: next?.toISOString() ?? null,
		paused: settings.paused,
		intervalMinutes: settings.intervalMinutes,
	} satisfies ScraperStatus)
}

/** `GET /api/scraper/runs`: histórico das coletas (últimos 90 dias), mais recentes primeiro. */
export async function listRuns(req: Request) {
	const query = RunsQuerySchema.parse(queryParams(req))
	const filter = query.cursor ? afterCursor(decodeCursor(query.cursor), 'startedAt') : {}

	const docs = await ScraperRun.find(filter)
		.sort({ startedAt: -1, _id: -1 })
		.limit(query.limit + 1)
		.lean()

	const page = docs.slice(0, query.limit)
	const last = page.at(-1)
	const nextCursor = docs.length > query.limit && last ? encodeCursor({ at: last.startedAt, id: String(last._id) }) : null

	return Response.json({ runs: page.map(toWebRun), nextCursor } satisfies RunsPage)
}

/** `POST /api/scraper/run`: "coletar agora" (funciona mesmo com as coletas pausadas). */
export async function requestRun(queue: QueueClient) {
	const running = await ScraperRun.exists({ status: 'running' })
	if (running) throw new HttpError(409, 'Já há uma coleta em andamento')

	const command: ScraperCommand = { command: 'run-now', requestedBy: 'web', requestedAt: new Date().toISOString() }
	await queue.publish(QUEUES.scraper, command)

	return Response.json({ requested: true }, { status: 202 })
}

function toWebRun(doc: RunDocument): WebScraperRun {
	return {
		id: String(doc._id),
		trigger: doc.trigger,
		status: doc.status,
		startedAt: doc.startedAt.toISOString(),
		finishedAt: doc.finishedAt?.toISOString() ?? null,
		sent: doc.sent ?? 0,
		terms: (doc.terms ?? []).map(term => ({ term: term.term, sent: term.sent ?? 0, error: term.error ?? null })),
		error: doc.error ?? null,
	}
}
