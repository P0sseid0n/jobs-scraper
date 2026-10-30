import { z } from 'zod'

import { normalizeCompany } from '@shared/contracts'
import { Job, setJobApplied } from '@shared/database'

import { similarTitles, specificApplyLink } from '../../post-processing/job-duplicates'
import type { JobAppliedChange, WebAppliedSimilar } from '../api-types'
import type { EventHub } from './event-hub'
import { HttpError, readJson } from './http'
import { APPLIED, LISTABLE_JOBS } from './jobs-query'

export const JobAppliedSchema = z.object({ applied: z.boolean() })

/**
 * `PUT /api/jobs/:postId/applied` com `{ applied }`: marca que a pessoa se candidatou à vaga, ou desmarca. Responde
 * `{ postId, appliedAt }` como ficou no banco e, se mudou, avisa os navegadores conectados.
 */
export async function setJobAppliedRoute(req: Request & { params: { postId: string } }, { events }: { events: EventHub }) {
	const { postId } = req.params
	const { applied } = JobAppliedSchema.parse(await readJson(req))

	const listed = await Job.exists({ ...LISTABLE_JOBS, postId })
	const result = listed && (await setJobApplied(postId, applied))
	if (!result) throw new HttpError(404, 'Vaga não encontrada')

	const change: JobAppliedChange = { postId, appliedAt: result.appliedAt?.toISOString() ?? null }
	if (result.changed) events.broadcast('applied', change)
	return Response.json(change)
}

/** O que a comparação lê de cada vaga. */
type SimilarCandidate = { postId: string; title: string | null; company: string | null; applyLink: string | null }

/**
 * Se `other` parece a mesma vaga que `job`, postada de novo: o mesmo link de candidatura específico, ou a mesma empresa
 * (citada nas duas) com o mesmo cargo. É mais solto que o agrupamento de repostagens (que também pede o texto parecido),
 * porque aqui só avisa: a vaga não some.
 */
export function looksLikeSameJob(job: SimilarCandidate, other: SimilarCandidate) {
	if (job.postId === other.postId || !similarTitles(job.title, other.title)) return false

	const link = specificApplyLink(job.applyLink)
	if (link && link === specificApplyLink(other.applyLink)) return true

	const company = normalizeCompany(job.company)
	return company !== null && company === normalizeCompany(other.company)
}

/**
 * `GET /api/jobs/:postId/applied-similar`: a vaga mais recente em que a pessoa já se candidatou e que parece a mesma
 * desta (`looksLikeSameJob`), ou `null`. As repostagens agrupadas não precisam disto: elas ficam na vaga original, que
 * já mostra a candidatura.
 */
export async function appliedSimilar(req: Request & { params: { postId: string } }) {
	const job = await Job.findOne({ postId: req.params.postId }, { postId: 1, title: 1, company: 1, applyLink: 1 }).lean<
		SimilarCandidate & { appliedAt?: Date | null }
	>()
	if (!job) throw new HttpError(404, 'Vaga não encontrada')

	// Só as candidatadas, que são poucas: a comparação do cargo fica aqui, não na consulta
	const applied = await Job.find(
		{ ...APPLIED, postId: { $ne: job.postId }, title: { $type: 'string' } },
		{ postId: 1, title: 1, company: 1, applyLink: 1, appliedAt: 1 },
	)
		.sort({ appliedAt: -1 })
		.lean<(SimilarCandidate & { title: string; appliedAt: Date })[]>()

	const match = applied.find(other => looksLikeSameJob(job, other))
	const similar: WebAppliedSimilar | null = match
		? { postId: match.postId, title: match.title, company: match.company ?? null, appliedAt: match.appliedAt.toISOString() }
		: null
	return Response.json(similar)
}
