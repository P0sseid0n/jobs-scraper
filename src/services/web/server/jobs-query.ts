import { Types } from 'mongoose'
import { z } from 'zod'

import { CONTRACT_TYPES, needsReview, WORK_MODES, type ProcessedJob } from '@shared/contracts'
import type { JobCorrectionState, JobExtractionSource, JobViewState } from '@shared/database'

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
	/** Regimes aceitos (a vaga entra se citar qualquer um deles); `none` são as vagas sem regime. */
	contractType: csv.pipe(z.array(z.enum([...CONTRACT_TYPES, 'none']))),
	/** Tecnologias que a vaga precisa pedir (todas), sem diferenciar maiúsculas. */
	skills: csv.pipe(z.array(z.string().max(100)).max(20)),
	since: z.enum(['24h', '7d', '30d', 'all']).default('all'),
	hasEmail: z
		.enum(['true', 'false'])
		.optional()
		.transform(value => value === 'true'),
	/** `true`: só as vagas já abertas no site; `false`: só as não vistas; ausente: todas. */
	viewed: z
		.enum(['true', 'false'])
		.optional()
		.transform(value => (value === undefined ? undefined : value === 'true')),
	language: z
		.string()
		.regex(/^[a-z]{2}$/)
		.optional(),
	cursor: z.string().max(200).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(30),
})

export type JobsQuery = z.output<typeof JobsQuerySchema>

/**
 * Vagas que a interface mostra: com `postId` (documentos antigos não têm) e cargo, e que não foram marcadas pelo
 * site como "não é vaga" nem como "outro idioma".
 */
export const LISTABLE_JOBS = {
	postId: { $type: 'string' as const },
	title: { $type: 'string' as const },
	notAJob: { $ne: true },
	wrongLanguage: { $ne: true },
}

/** Vagas já abertas no site. */
export const VIEWED = { viewedAt: { $type: 'date' as const } }
/** Vagas não vistas: `null` ou sem o campo (salvas antes de ele existir). */
export const NOT_VIEWED = { viewedAt: null }

/** Monta o filtro do MongoDB para a lista de vagas (mais recentes primeiro, paginada por cursor). */
export function buildJobsFilter(query: JobsQuery, now = new Date()) {
	const conditions: Record<string, unknown>[] = [LISTABLE_JOBS]

	if (query.q) {
		const pattern = new RegExp(escapeRegExp(query.q), 'i')
		conditions.push({
			$or: [{ title: pattern }, { company: pattern }, { necessaryKnowledge: pattern }, { rawContent: pattern }],
		})
	}

	if (query.workMode.length > 0) {
		const modes = query.workMode.map(mode => (mode === 'none' ? null : mode))
		conditions.push({ workMode: { $in: modes } })
	}

	if (query.contractType.length > 0) {
		const types = query.contractType.filter(type => type !== 'none')
		const options: Record<string, unknown>[] = []
		if (types.length > 0) options.push({ contractTypes: { $in: types } })
		// Sem regime: `null`, lista vazia ou campo ausente (vagas salvas antes do campo existir)
		if (query.contractType.includes('none')) options.push({ contractTypes: null }, { contractTypes: { $size: 0 } })
		conditions.push({ $or: options })
	}

	if (query.skills.length > 0) {
		conditions.push({ necessaryKnowledge: { $all: query.skills.map(skill => new RegExp(`^${escapeRegExp(skill)}$`, 'i')) } })
	}

	if (query.since !== 'all') {
		conditions.push({ createdAt: { $gte: new Date(now.getTime() - PERIODS[query.since] * 24 * 60 * 60 * 1000) } })
	}

	if (query.hasEmail) conditions.push({ recruiterEmail: { $nin: [null, ''] } })
	if (query.viewed !== undefined) conditions.push(query.viewed ? VIEWED : NOT_VIEWED)
	if (query.language) conditions.push({ language: query.language })
	if (query.cursor) conditions.push(afterCursor(decodeCursor(query.cursor)))

	return { $and: conditions }
}

/** Itens depois do cursor na ordem `createdAt` desc, `_id` desc (o `_id` desempata vagas salvas no mesmo instante). */
export function afterCursor(cursor: Cursor, field = 'createdAt') {
	const id = new Types.ObjectId(cursor.id)

	return { $or: [{ [field]: { $lt: cursor.at } }, { [field]: cursor.at, _id: { $lt: id } }] }
}

/**
 * Documento da coleção `jobs` como o `lean()` devolve (com os timestamps do mongoose). Vagas salvas antes do
 * campo `contractTypes`, dos de correção, do `viewedAt` e dos das imagens não os têm.
 */
export type JobDocument = Omit<ProcessedJob, 'title' | 'contractTypes' | 'extractionChecks' | 'imageCount' | 'imageText'> &
	Partial<JobExtractionSource & JobCorrectionState & JobViewState> & {
		title: string | null
		contractTypes?: ProcessedJob['contractTypes']
		extractionChecks?: ProcessedJob['extractionChecks']
		imageCount?: number
		imageText?: string | null
		createdAt?: Date | null
	}

/**
 * Converte o documento do MongoDB no formato da API (sem campos internos como `_id` e `notifiedAt`).
 * @param reviewChecksPercent O limite de checks das configurações, para dizer se a vaga pede para conferir o post.
 */
export function toWebJob(doc: JobDocument, reviewChecksPercent: number): WebJob {
	const extractionChecks = doc.extractionChecks ?? []

	return {
		postId: doc.postId,
		title: doc.title ?? 'Vaga sem título',
		company: doc.company ?? null,
		location: doc.location ?? null,
		workMode: doc.workMode ?? null,
		contractTypes: doc.contractTypes?.length ? doc.contractTypes : null,
		necessaryKnowledge: doc.necessaryKnowledge?.length ? doc.necessaryKnowledge : null,
		applyLink: doc.applyLink ?? null,
		recruiterEmail: doc.recruiterEmail ?? null,
		author: doc.author ?? null,
		postedAt: doc.postedAt ?? null,
		createdAt: (doc.createdAt ?? new Date()).toISOString(),
		extractionChecks,
		needsReview: needsReview(extractionChecks, reviewChecksPercent),
		language: doc.language ?? null,
		sourcePostId: doc.sourcePostId ?? null,
		postLink: doc.postLink ?? null,
		rawContent: doc.rawContent,
		imageCount: doc.imageCount ?? 0,
		imageText: doc.imageText ?? null,
		correctedAt: doc.correctedAt?.toISOString() ?? null,
		viewedAt: doc.viewedAt?.toISOString() ?? null,
	}
}

export function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
