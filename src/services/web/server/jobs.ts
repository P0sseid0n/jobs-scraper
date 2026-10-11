import { Job } from '@shared/database'

import type { JobFacets, JobsPage, WebJob } from '../api-types'
import { encodeCursor, HttpError, queryParams } from './http'
import { buildJobsFilter, JobsQuerySchema, LISTABLE_JOBS, toWebJob, type JobDocument } from './jobs-query'

const TOP_SKILLS = 40

/** `GET /api/jobs`: lista paginada com filtros, mais recentes primeiro. */
export async function listJobs(req: Request) {
	const query = JobsQuerySchema.parse(queryParams(req))

	// Um item a mais diz se há próxima página
	const docs = await Job.find(buildJobsFilter(query))
		.sort({ createdAt: -1, _id: -1 })
		.limit(query.limit + 1)
		.lean<(JobDocument & { _id: unknown; createdAt: Date })[]>()

	const page = docs.slice(0, query.limit)
	const last = page.at(-1)
	const nextCursor = docs.length > query.limit && last ? encodeCursor({ at: last.createdAt, id: String(last._id) }) : null

	return Response.json({ jobs: page.map(toWebJob), nextCursor } satisfies JobsPage)
}

/** `GET /api/jobs/facets`: contagens para os filtros (modalidades e tecnologias mais pedidas). */
export async function jobFacets() {
	const [total, modes, skills] = await Promise.all([
		Job.countDocuments(LISTABLE_JOBS),
		Job.aggregate<{ _id: string | null; count: number }>([
			{ $match: LISTABLE_JOBS },
			{ $group: { _id: '$workMode', count: { $sum: 1 } } },
		]),
		// Agrupa sem diferenciar maiúsculas ("Vue.js" e "vue.js"); mostra a grafia mais usada
		Job.aggregate<{ name: string; count: number }>([
			{ $match: LISTABLE_JOBS },
			{ $unwind: '$necessary_knowledge' },
			{ $group: { _id: { key: { $toLower: '$necessary_knowledge' }, name: '$necessary_knowledge' }, count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $group: { _id: '$_id.key', name: { $first: '$_id.name' }, count: { $sum: '$count' } } },
			{ $sort: { count: -1, name: 1 } },
			{ $limit: TOP_SKILLS },
			{ $project: { _id: 0, name: 1, count: 1 } },
		]),
	])

	const workModes: JobFacets['workModes'] = { remoto: 0, hibrido: 0, presencial: 0, none: 0 }
	for (const mode of modes) workModes[mode._id && mode._id in workModes ? (mode._id as keyof typeof workModes) : 'none'] += mode.count

	return Response.json({ total, workModes, skills } satisfies JobFacets)
}

/** `GET /api/jobs/:postId` */
export async function getJob(req: Request & { params: { postId: string } }) {
	const doc = await Job.findOne({ ...LISTABLE_JOBS, postId: req.params.postId }).lean<JobDocument>()
	if (!doc) throw new HttpError(404, 'Vaga não encontrada')

	return Response.json(toWebJob(doc) satisfies WebJob)
}
