import { z } from 'zod'

import { Job } from '@shared/database'

import type { JobsViewedChange } from '../api-types'
import type { EventHub } from './event-hub'
import { HttpError, readJson } from './http'
import { LISTABLE_JOBS, NOT_VIEWED, VIEWED } from './jobs-query'

/** O que fica em `jobs:seen` no navegador antigo: até 2.000 vagas importadas de uma vez. */
const MAX_POST_IDS = 2_000

export const JobViewedSchema = z.object({ viewed: z.boolean() })

export const JobsViewedSchema = z.object({
	postIds: z.array(z.string().min(1).max(200)).min(1).max(MAX_POST_IDS),
	viewed: z.boolean(),
})

/**
 * Filtro das vagas que mudam ao marcar (`viewed`) ou desmarcar: só as que ainda não estão assim. Marcar de novo uma
 * vaga já vista não troca a data em que ela foi vista pela primeira vez.
 */
export function viewedFilter(postIds: string[], viewed: boolean) {
	return { ...LISTABLE_JOBS, postId: { ...LISTABLE_JOBS.postId, $in: postIds }, ...(viewed ? NOT_VIEWED : VIEWED) }
}

/** Marca ou desmarca as vagas e avisa os navegadores conectados; devolve as que mudaram. */
async function applyViewed(postIds: string[], viewed: boolean, events: EventHub): Promise<JobsViewedChange> {
	const filter = viewedFilter(postIds, viewed)
	const viewedAt = viewed ? new Date() : null

	const changed = (await Job.find(filter, { postId: 1 }).lean<{ postId: string }[]>()).map(doc => doc.postId)
	if (changed.length === 0) return { postIds: [], viewedAt: viewedAt?.toISOString() ?? null }

	await Job.updateMany({ ...filter, postId: { $in: changed } }, { $set: { viewedAt } })

	const change = { postIds: changed, viewedAt: viewedAt?.toISOString() ?? null }
	events.broadcast('viewed', change)
	return change
}

/**
 * `PUT /api/jobs/:postId/viewed` com `{ viewed }`: marca a vaga como vista (ao abrir o detalhe ou à mão) ou como não
 * vista. Responde `{ postId, viewedAt }` como ficou no banco.
 */
export async function setJobViewed(req: Request & { params: { postId: string } }, { events }: { events: EventHub }) {
	const { postId } = req.params
	const { viewed } = JobViewedSchema.parse(await readJson(req))

	await applyViewed([postId], viewed, events)

	const doc = await Job.findOne({ ...LISTABLE_JOBS, postId }, { viewedAt: 1 }).lean<{ viewedAt?: Date | null }>()
	if (!doc) throw new HttpError(404, 'Vaga não encontrada')

	return Response.json({ postId, viewedAt: doc.viewedAt?.toISOString() ?? null })
}

/**
 * `PUT /api/jobs/viewed` com `{ postIds, viewed }`: marca ou desmarca várias vagas (as da tela, ou as vistas guardadas
 * no navegador antes de o servidor guardar). Responde só as que mudaram.
 */
export async function setJobsViewed(req: Request, { events }: { events: EventHub }) {
	const { postIds, viewed } = JobsViewedSchema.parse(await readJson(req))

	return Response.json((await applyViewed(postIds, viewed, events)) satisfies JobsViewedChange)
}
