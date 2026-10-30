import mongoose, { Schema } from 'mongoose'

import { CONTRACT_TYPES, EXTRACTION_CHECKS, WORK_MODES, type ProcessedJob } from '../contracts/job'
import type { JobFields } from '../contracts/job-correction'

/** Modelo e versão do prompt que extraíram a vaga, para saber de onde veio cada erro corrigido. */
export type JobExtractionSource = { extractionModel: string | null; promptVersion: string | null }

/** O que muda numa vaga corrigida pelo site (ver `PATCH /api/jobs/:postId`). */
export type JobCorrectionState = {
	/** A extração original da IA, guardada na primeira correção; `null` numa vaga nunca corrigida. */
	aiExtraction: JobFields | null
	correctedAt: Date | null
	/** Marcada pelo site como "não é vaga": sai da lista, mas o documento fica. */
	notAJob: boolean
	/** Marcada pelo site como fora dos idiomas aceitos (o filtro de idioma deixou passar): sai da lista, mas o documento fica. */
	wrongLanguage: boolean
	/** Removida pelo site por ser de uma empresa bloqueada: sai da lista, mas o documento fica (desbloquear não a traz de volta). */
	blockedCompany: boolean
}

/** Quando a vaga foi aberta no site (`null`: ainda não vista). O sistema tem um único usuário: o campo fica na vaga. */
export type JobViewState = { viewedAt: Date | null }

/** Quando a pessoa marcou que se candidatou à vaga (`null`: não se candidatou). Também fica na vaga, como o `viewedAt`. */
export type JobApplicationState = { appliedAt: Date | null }

/** Outro post da mesma vaga (ver `post-processing/job-duplicates.ts`), guardado na vaga original. */
export type JobRepost = { postId: string; author: string | null; postLink: string | null; postedAt: string | null; createdAt: Date }

/**
 * O agrupamento da mesma vaga repostada: a repostagem aponta para a original em `duplicateOf` (sai da lista e não é
 * anunciada), e a original guarda os outros posts em `reposts`. Vagas salvas antes dos campos não os têm: ausente é o
 * mesmo que `null` / nenhum.
 */
export type JobDuplicateState = { duplicateOf: string | null; reposts: JobRepost[] }

type JobDocument = ProcessedJob &
	JobExtractionSource &
	JobCorrectionState &
	JobViewState &
	JobApplicationState &
	JobDuplicateState & { notifiedAt: Date | null }

const jobSchema = new Schema<JobDocument>(
	{
		// sparse: documentos antigos (sem postId) não entram no índice único
		postId: { type: String, required: true, unique: true, sparse: true },
		rawContent: { type: String, required: true },
		title: { type: String, default: null },
		company: { type: String, default: null },
		// Vagas salvas antes do campo não o têm: ausente é o mesmo que `false`
		companyConfidential: { type: Boolean, default: false },
		location: { type: String, default: null },
		applyLink: { type: String, default: null },
		necessaryKnowledge: { type: [String], default: null },
		recruiterEmail: { type: String, default: null },
		workMode: { type: String, enum: [...WORK_MODES, null], default: null },
		// Vagas salvas antes do campo não o têm: ausente é o mesmo que `null` (regime não informado)
		contractTypes: { type: [{ type: String, enum: CONTRACT_TYPES }], default: null },
		// Vagas salvas antes do campo não o têm: ausente é o mesmo que nenhum check
		extractionChecks: { type: [{ type: String, enum: EXTRACTION_CHECKS }], default: [] },
		postedAt: { type: String, default: null },
		author: { type: String, default: null },
		// Vagas salvas antes do campo não o têm: ausente é o mesmo que `null`
		authorHeadline: { type: String, default: null },
		language: { type: String, default: null },
		sourcePostId: { type: String, default: null },
		postLink: { type: String, default: null },
		// Vagas salvas antes destes campos não os têm: ausente é o mesmo que nenhuma imagem
		imageCount: { type: Number, default: 0 },
		imageText: { type: String, default: null },
		// Vagas salvas antes destes campos não os têm: ausente é o mesmo que `null` / `false`
		extractionModel: { type: String, default: null },
		promptVersion: { type: String, default: null },
		aiExtraction: { type: Schema.Types.Mixed, default: null },
		correctedAt: { type: Date, default: null },
		notAJob: { type: Boolean, default: false },
		wrongLanguage: { type: Boolean, default: false },
		blockedCompany: { type: Boolean, default: false },
		viewedAt: { type: Date, default: null },
		appliedAt: { type: Date, default: null },
		duplicateOf: { type: String, default: null },
		reposts: {
			type: [
				{
					_id: false,
					postId: { type: String, required: true },
					author: { type: String, default: null },
					postLink: { type: String, default: null },
					postedAt: { type: String, default: null },
					createdAt: { type: Date, required: true },
				},
			],
			default: [],
		},
		// Quando o evento `job-published` foi publicado (com pelo menos uma fila ligada); não confirma a entrega
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export const Job = mongoose.model('Job', jobSchema, 'jobs')

/**
 * Marca (`applied`) ou desmarca a candidatura da vaga, pelo site ou pelo Discord. Marcar de novo uma vaga já marcada não
 * troca a data da primeira marcação.
 * @returns A data como ficou no banco (`null`: desmarcada) e se mudou; `undefined` se a vaga não existe.
 */
export async function setJobApplied(postId: string, applied: boolean) {
	const changed = await Job.findOneAndUpdate(
		{ postId, appliedAt: applied ? null : { $type: 'date' } },
		{ $set: { appliedAt: applied ? new Date() : null } },
		{ returnDocument: 'after', projection: { appliedAt: 1 }, lean: true },
	)
	if (changed) return { appliedAt: changed.appliedAt ?? null, changed: true }

	const doc = await Job.findOne({ postId }, { appliedAt: 1 }).lean()
	return doc ? { appliedAt: doc.appliedAt ?? null, changed: false } : undefined
}
