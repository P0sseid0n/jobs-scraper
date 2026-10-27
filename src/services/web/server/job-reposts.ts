import { needsReview, ProcessedJobSchema, type JobPublished } from '@shared/contracts'
import { Job } from '@shared/database'
import type { Logger } from '@shared/logging'
import { EXCHANGES, type QueueClient } from '@shared/messaging'
import { readSettings } from '@shared/settings'

import type { WebJob } from '../api-types'
import { HttpError } from './http'
import { LISTABLE_JOBS, toWebJob, type JobDocument } from './jobs-query'

/**
 * `DELETE /api/jobs/:postId/reposts/:repostId` ("não é a mesma vaga"): desfaz o agrupamento. A repostagem vira uma
 * vaga própria e é anunciada aos canais (Discord e a lista do site), como seria se não tivesse sido agrupada. Responde a
 * vaga original atualizada.
 */
export async function ungroupRepost(
	req: Request & { params: { postId: string; repostId: string } },
	{ queue, logger }: { queue: QueueClient; logger: Logger },
) {
	const { postId, repostId } = req.params

	const original = await Job.findOne({ ...LISTABLE_JOBS, postId, 'reposts.postId': repostId }, { _id: 1 }).lean()
	if (!original) throw new HttpError(404, 'Repostagem não encontrada nesta vaga')

	const repost = await Job.findOneAndUpdate(
		{ postId: repostId, duplicateOf: postId },
		{ $set: { duplicateOf: null } },
		{ returnDocument: 'after', lean: true },
	)
	const updated = await Job.findOneAndUpdate(
		{ postId },
		{ $pull: { reposts: { postId: repostId } } },
		{ returnDocument: 'after', lean: true },
	)
	if (!updated) throw new HttpError(404, 'Vaga não encontrada')

	const { reviewChecksPercent } = await readSettings('post-processing')

	// A repostagem nunca foi anunciada: agora que é uma vaga própria, os canais a recebem
	if (repost && !repost.notifiedAt) {
		const job = ProcessedJobSchema.parse(repost)
		const event: JobPublished = { ...job, needsReview: needsReview(job.extractionChecks, reviewChecksPercent) }
		await queue.publishEvent(EXCHANGES.jobPublished, event)
		await Job.updateOne({ postId: repostId }, { notifiedAt: new Date() })
	}

	logger.info({ postId, repostId }, 'Repostagem separada pelo site: virou uma vaga própria')
	return Response.json(toWebJob(updated as JobDocument, reviewChecksPercent) satisfies WebJob)
}
