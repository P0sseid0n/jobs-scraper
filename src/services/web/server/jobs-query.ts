import { Types } from 'mongoose'
import { z } from 'zod'

import { WORK_MODES, type ProcessedJob } from '@shared/contracts'

import type { WebJob } from '../api-types'
import { decodeCursor, type Cursor } from './http'

export const PERIODS = { '24h': 1, '7d': 7, '30d': 30 } as const

/** Lista separada por vírgula na query string ("remoto,hibrido"), sem itens vazios. */
const csv = z
	.string()
	.optional()
	.transform(value =>
		(value ?? '')
			.split(',')
			.map(item => item.trim())
			.filter(Boolean),
	)

export const JobsQuerySchema = z.object({
	/** Busca no cargo, empresa, tecnologias e texto do post. */
	q: z.string().trim().max(200).optional(),
	/** Modalidades aceitas; `none` são as vagas sem modalidade. */
	workMode: csv.pipe(z.array(z.enum([...WORK_MODES, 'none']))),
	/** Tecnologias que a vaga precisa pedir (todas), sem diferenciar maiúsculas. */
	skills: csv.pipe(z.array(z.string().max(100)).max(20)),
	since: z.enum(['24h', '7d', '30d', 'all']).default('all'),
	hasEmail: z
		.enum(['true', 'false'])
		.optional()
		.transform(value => value === 'true'),
	language: z
		.string()
		.regex(/^[a-z]{2}$/)
		.optional(),
	minConfidence: z.coerce.number().min(0).max(100).optional(),
	cursor: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
})

export type JobsQuery = z.output<typeof JobsQuerySchema>

/** Vagas que a interface consegue mostrar: com `postId` (documentos antigos não têm) e cargo. */
export const LISTABLE_JOBS = { postId: { $type: 'string' as const }, title: { $type: 'string' as const } }

/** Monta o filtro do MongoDB para a lista de vagas (mais recentes primeiro, paginada por cursor). */
export function buildJobsFilter(query: JobsQuery, now = new Date()) {
	const conditions: Record<string, unknown>[] = [LISTABLE_JOBS]

	if (query.q) {
		const pattern = new RegExp(escapeRegExp(query.q), 'i')
		conditions.push({
			$or: [{ title: pattern }, { company: pattern }, { necessary_knowledge: pattern }, { rawContent: pattern }],
		})
	}

	if (query.workMode.length > 0) {
		const modes = query.workMode.map(mode => (mode === 'none' ? null : mode))
		conditions.push({ workMode: { $in: modes } })
	}

	if (query.skills.length > 0) {
		conditions.push({ necessary_knowledge: { $all: query.skills.map(skill => new RegExp(`^${escapeRegExp(skill)}$`, 'i')) } })
	}

	if (query.since !== 'all') {
		conditions.push({ createdAt: { $gte: new Date(now.getTime() - PERIODS[query.since] * 24 * 60 * 60 * 1000) } })
	}

	if (query.hasEmail) conditions.push({ recruiter_email: { $nin: [null, ''] } })
	if (query.language) conditions.push({ language: query.language })
	if (query.minConfidence !== undefined) conditions.push({ aiJobConfidence: { $gte: query.minConfidence } })
	if (query.cursor) conditions.push(afterCursor(decodeCursor(query.cursor)))

	return { $and: conditions }
}

/** Itens depois do cursor na ordem `createdAt` desc, `_id` desc (o `_id` desempata vagas salvas no mesmo instante). */
export function afterCursor(cursor: Cursor, field = 'createdAt') {
	const id = new Types.ObjectId(cursor.id)

	return { $or: [{ [field]: { $lt: cursor.at } }, { [field]: cursor.at, _id: { $lt: id } }] }
}

/** Documento da coleção `jobs` como o `lean()` devolve (com os timestamps do mongoose). */
export type JobDocument = Omit<ProcessedJob, 'title'> & { title: string | null; createdAt?: Date | null }

/** Converte o documento do MongoDB no formato da API (sem campos internos como `_id` e `notifiedAt`). */
export function toWebJob(doc: JobDocument): WebJob {
	return {
		postId: doc.postId,
		title: doc.title ?? 'Vaga sem título',
		company: doc.company ?? null,
		location: doc.location ?? null,
		workMode: doc.workMode ?? null,
		necessary_knowledge: doc.necessary_knowledge?.length ? doc.necessary_knowledge : null,
		link: doc.link ?? null,
		recruiter_email: doc.recruiter_email ?? null,
		author: doc.author ?? null,
		postedAt: doc.postedAt ?? null,
		createdAt: (doc.createdAt ?? new Date()).toISOString(),
		aiJobConfidence: doc.aiJobConfidence,
		language: doc.language ?? null,
		rawContent: doc.rawContent,
	}
}

export function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
