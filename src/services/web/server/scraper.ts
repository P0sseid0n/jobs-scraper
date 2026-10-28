import { z } from 'zod'

import { activeSearchTerms, type DatePostedFilter, type ScraperCommand } from '@shared/contracts'
import {
	consecutiveShortRuns,
	Job,
	neverCollected,
	ScraperRun,
	SeenPost,
	type ScraperLoginFailure,
	type ScraperRunStatus,
	type ScraperRunTerm,
	type ScraperRunTrigger,
	type ScraperTermErrorKind,
	type SeenPostOutcome,
} from '@shared/database'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials, readSettings } from '@shared/settings'

import { intervalStretch, nextRunAt, waitingReason } from '../../scraper/schedule'
import { RUNS_PAGE_SIZES, type RunsPage, type RunsPageSize, type ScraperStatus, type WebScraperRun } from '../api-types'
import { HttpError, queryParams } from './http'

const RunsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce
		.number()
		.refine((value): value is RunsPageSize => (RUNS_PAGE_SIZES as readonly number[]).includes(value))
		.default(20),
})

type OptionalTermField = 'skipped' | 'otherLanguage' | 'postIds' | 'errorKind' | 'searchUrl' | 'datePosted'

type RunDocument = {
	_id: unknown
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: Date
	finishedAt: Date | null
	sent: number
	plannedTerms?: string[]
	minJobs?: number | null
	deferredLists?: string[]
	// Coletas antigas não têm alguns dos campos de cada termo
	terms: (Omit<ScraperRunTerm, OptionalTermField> & Partial<Pick<ScraperRunTerm, OptionalTermField>>)[]
	error: string | null
	loginFailure?: ScraperLoginFailure | null
}

/** `GET /api/scraper/status`: coleta em andamento, última coleta e próxima agendada. */
export async function scraperStatus({ skipOnboarding }: { skipOnboarding: boolean }) {
	const [current, last, settings, linkedinAccount, firstRun, shortRuns] = await Promise.all([
		ScraperRun.findOne({ status: 'running' }).sort({ startedAt: -1 }).lean(),
		ScraperRun.findOne({ status: { $ne: 'running' } })
			.sort({ startedAt: -1 })
			.lean(),
		readSettings('scraper'),
		hasLinkedinAccount(),
		skipOnboarding ? false : neverCollected(),
		consecutiveShortRuns(),
	])

	// Mesma conta do scraper: intervalo a partir do início da última coleta (em andamento ou não)
	const lastStartedAt = current?.startedAt ?? last?.startedAt ?? null
	const terms = activeSearchTerms(settings).length
	const waiting = waitingReason({
		paused: settings.paused,
		activeSearchTerms: terms,
		hasAccount: linkedinAccount,
		awaitingFirstRun: firstRun && !current,
	})
	const next = waiting ? null : nextRunAt(lastStartedAt, settings.intervalMinutes, shortRuns)

	return Response.json({
		current: current ? await toWebRun(current) : null,
		last: last ? await toWebRun(last) : null,
		nextRunAt: next?.toISOString() ?? null,
		paused: settings.paused,
		intervalMinutes: settings.intervalMinutes,
		intervalStretch: intervalStretch(shortRuns),
		activeSearchTerms: terms,
		linkedinAccount,
		awaitingFirstRun: waiting === 'first-run',
	} satisfies ScraperStatus)
}

/** `GET /api/scraper/runs`: histórico das coletas (últimos 90 dias), mais recentes primeiro. */
export async function listRuns(req: Request) {
	const query = RunsQuerySchema.parse(queryParams(req))

	// Por número de página: o histórico é curto (90 dias), então o `skip` não pesa
	const [docs, total] = await Promise.all([
		ScraperRun.find()
			.sort({ startedAt: -1, _id: -1 })
			.skip((query.page - 1) * query.limit)
			.limit(query.limit)
			.lean(),
		ScraperRun.countDocuments(),
	])

	return Response.json({ runs: await Promise.all(docs.map(toWebRun)), total } satisfies RunsPage)
}

/** `POST /api/scraper/run`: "coletar agora" (funciona mesmo com as coletas pausadas, mas não sem termos nem sem conta). */
export async function requestRun(queue: QueueClient) {
	const [running, settings, linkedinAccount] = await Promise.all([
		ScraperRun.exists({ status: 'running' }),
		readSettings('scraper'),
		hasLinkedinAccount(),
	])
	if (running) throw new HttpError(409, 'Já há uma coleta em andamento')
	if (activeSearchTerms(settings).length === 0) throw new HttpError(409, 'Configure os termos de busca antes de coletar')
	if (!linkedinAccount) throw new HttpError(409, 'Conecte sua conta do LinkedIn (Configurações › Contas) antes de coletar')

	const command: ScraperCommand = { command: 'run-now', requestedBy: 'web', requestedAt: new Date().toISOString() }
	await queue.publish(QUEUES.scraper, command)

	return Response.json({ requested: true }, { status: 202 })
}

/**
 * Se o scraper tem uma conta do LinkedIn para coletar (site ou `.env`). Uma conta inválida no banco conta como
 * nenhuma: o scraper não consegue usá-la até ela ser salva de novo.
 */
function hasLinkedinAccount() {
	return loadCredentials('linkedin').then(Boolean, () => false)
}

/** A coleta para o site, com as vagas que saíram dela (as de posts com várias vagas apontam o post em `sourcePostId`). */
async function toWebRun(doc: RunDocument): Promise<WebScraperRun> {
	const terms = doc.terms ?? []
	const tracked = terms.length > 0 && terms.every(term => term.postIds !== undefined)
	// As listas deixadas para outra coleta podem voltar numa busca seguinte: o destino delas fica com aquela coleta
	const deferred = new Set(doc.deferredLists ?? [])
	const postIds = terms.flatMap(term => term.postIds ?? []).filter(postId => !deferred.has(postId))

	const [newJobs, outcomes] = tracked ? await Promise.all([countNewJobs(postIds), countOutcomes(postIds)]) : [null, null]
	if (outcomes && deferred.size > 0) outcomes.counts['deferred-list'] = deferred.size

	return {
		id: String(doc._id),
		trigger: doc.trigger,
		status: doc.status,
		startedAt: doc.startedAt.toISOString(),
		finishedAt: doc.finishedAt?.toISOString() ?? null,
		sent: doc.sent ?? 0,
		skipped: terms.reduce((total, term) => total + (term.skipped ?? 0), 0),
		otherLanguage: terms.reduce((total, term) => total + (term.otherLanguage ?? 0), 0),
		newJobs,
		outcomes,
		plannedTerms: doc.plannedTerms ?? [],
		minJobs: doc.minJobs ?? null,
		terms: terms.map(term => ({
			term: term.term,
			sent: term.sent ?? 0,
			skipped: term.skipped ?? 0,
			otherLanguage: term.otherLanguage ?? 0,
			error: term.error ?? null,
			errorKind: term.error ? (term.errorKind ?? legacyErrorKind(term.error)) : null,
			searchUrl: term.searchUrl ?? null,
			datePosted: (term.datePosted as DatePostedFilter | null | undefined) ?? null,
		})),
		error: doc.error ?? null,
		loginFailure: doc.loginFailure ?? (doc.status === 'failed' && isLegacyLoginFailure(doc.error) ? 'other' : null),
	}
}

/** As coletas anteriores ao `loginFailure` que pararam no login, pela mensagem. */
export function isLegacyLoginFailure(error: string | null | undefined) {
	return !!error && /login|captcha|2fa|verifica/i.test(error)
}

/** O tipo do erro das coletas anteriores ao `errorKind`, pela mensagem. */
function legacyErrorKind(error: string): ScraperTermErrorKind {
	return error.startsWith('Nenhum post encontrado') ? 'no-posts' : 'unknown'
}

function countNewJobs(postIds: string[]) {
	if (postIds.length === 0) return Promise.resolve(0)

	return Job.countDocuments({ $or: [{ postId: { $in: postIds } }, { sourcePostId: { $in: postIds } }] })
}

/** Quantos posts tiveram cada destino no post-processing; os que ainda não passaram por ele estão na fila. */
async function countOutcomes(postIds: string[]): Promise<NonNullable<WebScraperRun['outcomes']>> {
	if (postIds.length === 0) return { counts: {}, pending: 0 }

	const groups = await SeenPost.aggregate<{ _id: SeenPostOutcome | null; count: number }>([
		{ $match: { postId: { $in: postIds } } },
		{ $group: { _id: '$outcome', count: { $sum: 1 } } },
	])

	// Sem `outcome`: o post foi processado por uma versão anterior do post-processing
	const counts = Object.fromEntries(groups.map(group => [group._id ?? 'unknown', group.count]))
	const processed = groups.reduce((total, group) => total + group.count, 0)

	return { counts, pending: postIds.length - processed }
}
