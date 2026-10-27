import { CONTRACT_TYPES } from '@shared/contracts'
import { findJobImage, Job } from '@shared/database'
import { readSettings } from '@shared/settings'

import type { JobFacets, JobsPage, WebJob } from '../api-types'
import { postIdCandidates } from '../job-route-id'
import { encodeCursor, HttpError, queryParams } from './http'
import { buildJobsFilter, JobsQuerySchema, LISTABLE_JOBS, NOT_VIEWED, toWebJob, upToCursor, type JobDocument } from './jobs-query'

const TOP_SKILLS = 40
/** Até quantas vagas o `until` traz de uma vez; mais longe que isso, a lista começa normal e a vaga fica só no painel. */
const UNTIL_MAX = 300

/** A vaga do id da URL (`/vagas/<id>`), entre as que a interface mostra. */
const routeJob = (routeId: string) => ({
	...LISTABLE_JOBS,
	postId: { ...LISTABLE_JOBS.postId, $in: postIdCandidates(routeId) },
})

/** `GET /api/jobs`: lista paginada com filtros, mais recentes primeiro. */
export async function listJobs(req: Request) {
	const query = JobsQuerySchema.parse(queryParams(req))
	const filter = buildJobsFilter(query)
	const position = query.until && !query.cursor ? await positionInList(filter, query.until) : null
	const limit = (position ?? 0) + query.limit

	// Um item a mais diz se há próxima página
	const docs = await Job.find(filter)
		.sort({ createdAt: -1, _id: -1 })
		.limit(limit + 1)
		.lean<(JobDocument & { _id: unknown; createdAt: Date })[]>()

	const page = docs.slice(0, limit)
	const last = page.at(-1)
	const nextCursor = docs.length > limit && last ? encodeCursor({ at: last.createdAt, id: String(last._id) }) : null
	const { reviewChecksPercent } = await readSettings('post-processing')

	return Response.json({ jobs: page.map(doc => toWebJob(doc, reviewChecksPercent)), nextCursor } satisfies JobsPage)
}

/**
 * Quantas vagas a lista com `filter` tem do topo até a vaga `routeId`, inclusive. `null` se ela não aparece na lista
 * (não existe, não passa nos filtros) ou está depois das primeiras `UNTIL_MAX`.
 */
async function positionInList(filter: ReturnType<typeof buildJobsFilter>, routeId: string) {
	const target = await Job.findOne(routeJob(routeId), { createdAt: 1 }).lean<{ _id: unknown; createdAt?: Date | null }>()
	if (!target?.createdAt) return null

	const upTo = await Job.find({ $and: [...filter.$and, upToCursor({ at: target.createdAt, id: String(target._id) })] }, { _id: 1 })
		.sort({ createdAt: -1, _id: -1 })
		.limit(UNTIL_MAX + 1)
		.lean<{ _id: unknown }[]>()

	// Na ordem da lista, a vaga é a última até ela; se não for, ficou de fora pelos filtros ou pelo teto
	return upTo.length <= UNTIL_MAX && String(upTo.at(-1)?._id) === String(target._id) ? upTo.length : null
}

/** `GET /api/jobs/facets`: contagens para os filtros (não vistas, modalidades, regimes e tecnologias mais pedidas). */
export async function jobFacets() {
	const [total, unviewed, modes, contracts, skills] = await Promise.all([
		Job.countDocuments(LISTABLE_JOBS),
		Job.countDocuments({ ...LISTABLE_JOBS, ...NOT_VIEWED }),
		Job.aggregate<{ _id: string | null; count: number }>([
			{ $match: LISTABLE_JOBS },
			{ $group: { _id: '$workMode', count: { $sum: 1 } } },
		]),
		// Uma vaga "CLT ou PJ" conta nos dois; sem regime (null, vazio ou ausente) cai em `_id: null`
		Job.aggregate<{ _id: string | null; count: number }>([
			{ $match: LISTABLE_JOBS },
			{ $unwind: { path: '$contractTypes', preserveNullAndEmptyArrays: true } },
			{ $group: { _id: '$contractTypes', count: { $sum: 1 } } },
		]),
		// Agrupa sem diferenciar maiúsculas ("Vue.js" e "vue.js"); mostra a grafia mais usada
		Job.aggregate<{ name: string; count: number }>([
			{ $match: LISTABLE_JOBS },
			{ $unwind: '$necessaryKnowledge' },
			{ $group: { _id: { key: { $toLower: '$necessaryKnowledge' }, name: '$necessaryKnowledge' }, count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $group: { _id: '$_id.key', name: { $first: '$_id.name' }, count: { $sum: '$count' } } },
			{ $sort: { count: -1, name: 1 } },
			{ $limit: TOP_SKILLS },
			{ $project: { _id: 0, name: 1, count: 1 } },
		]),
	])

	const workModes: JobFacets['workModes'] = { remoto: 0, hibrido: 0, presencial: 0, none: 0 }
	for (const mode of modes) workModes[mode._id && mode._id in workModes ? (mode._id as keyof typeof workModes) : 'none'] += mode.count

	const contractTypes = Object.fromEntries([...CONTRACT_TYPES, 'none'].map(type => [type, 0])) as JobFacets['contractTypes']
	for (const contract of contracts) {
		const key = contract._id && contract._id in contractTypes ? (contract._id as keyof typeof contractTypes) : 'none'
		contractTypes[key] += contract.count
	}

	return Response.json({ total, unviewed, workModes, contractTypes, skills } satisfies JobFacets)
}

/** `GET /api/jobs/:postId` */
export async function getJob(req: Request & { params: { postId: string } }) {
	// O site pede pelo id curto da URL (sem `urn:li:<tipo>:`); o postId inteiro também vale
	const doc = await Job.findOne(routeJob(req.params.postId)).lean<JobDocument>()
	if (!doc) throw new HttpError(404, 'Vaga não encontrada')

	const { reviewChecksPercent } = await readSettings('post-processing')
	return Response.json(toWebJob(doc, reviewChecksPercent) satisfies WebJob)
}

/**
 * `GET /api/jobs/:postId/raw`: o documento como está no MongoDB, com os campos internos (`_id`, `notifiedAt`,
 * `sourcePostId`, datas), para depurar o que o pipeline salvou.
 */
export async function getRawJob(req: Request & { params: { postId: string } }) {
	const doc = await Job.findOne({ postId: req.params.postId }).lean()
	if (!doc) throw new HttpError(404, 'Vaga não encontrada')

	return Response.json(doc)
}

/**
 * `GET /api/jobs/:postId/images/:index`: uma imagem do post da vaga, baixada na coleta (a URL do LinkedIn expira).
 * A imagem de uma posição nunca muda: o navegador a guarda sem perguntar de novo.
 */
export async function getJobImage(req: Request & { params: { postId: string; index: string } }) {
	const index = Number(req.params.index)
	if (!Number.isInteger(index) || index < 0) throw new HttpError(404, 'Imagem não encontrada')

	const image = await findJobImage(req.params.postId, index)
	if (!image) throw new HttpError(404, 'Imagem não encontrada')

	return new Response(new Blob([new Uint8Array(image.data)]), {
		headers: {
			'Content-Type': image.mimeType,
			'Cache-Control': 'private, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff',
		},
	})
}
