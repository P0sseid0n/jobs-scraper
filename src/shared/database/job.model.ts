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
}

/** Quando a vaga foi aberta no site (`null`: ainda não vista). O sistema tem um único usuário: o campo fica na vaga. */
export type JobViewState = { viewedAt: Date | null }

type JobDocument = ProcessedJob & JobExtractionSource & JobCorrectionState & JobViewState & { notifiedAt: Date | null }

const jobSchema = new Schema<JobDocument>(
	{
		// sparse: documentos antigos (sem postId) não entram no índice único
		postId: { type: String, required: true, unique: true, sparse: true },
		rawContent: { type: String, required: true },
		title: { type: String, default: null },
		company: { type: String, default: null },
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
		language: { type: String, default: null },
		sourcePostId: { type: String, default: null },
		postLink: { type: String, default: null },
		// Vagas salvas antes destes campos não os têm: ausente é o mesmo que `null` / `false`
		extractionModel: { type: String, default: null },
		promptVersion: { type: String, default: null },
		aiExtraction: { type: Schema.Types.Mixed, default: null },
		correctedAt: { type: Date, default: null },
		notAJob: { type: Boolean, default: false },
		viewedAt: { type: Date, default: null },
		// Quando o evento `job-published` foi publicado (com pelo menos uma fila ligada); não confirma a entrega
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export const Job = mongoose.model('Job', jobSchema, 'jobs')
