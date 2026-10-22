import mongoose, { Schema } from 'mongoose'

import type { JobFields } from '../contracts/job-correction'

export const FEEDBACK_KINDS = ['fields', 'not-a-job'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

/**
 * Uma correção feita pelo site: o post, o que a IA extraiu e o que era o certo. É o caso de teste que o
 * `bun eval:extraction` roda de novo contra o prompt e o modelo atuais.
 */
export type ExtractionFeedbackRecord = {
	postId: string
	kind: FeedbackKind
	/** O post como foi para a IA (texto, autor) e os dados do scraper que também entram na vaga. */
	post: {
		text: string
		author: string | null
		url: string | null
		postedAt: string | null
		sourcePostId: string | null
	}
	/** O que a IA extraiu (já com as regras do post-processing), antes de qualquer correção. */
	aiOutput: JobFields
	/** Os valores certos de todos os campos depois desta correção; `null` quando o post não é vaga. */
	expected: JobFields | null
	/** Os campos que esta correção mudou. */
	correctedFields: string[]
	/** Modelo e versão do prompt que fizeram a extração; `null` em vagas salvas antes desses campos. */
	model: string | null
	promptVersion: string | null
	createdAt: Date
}

const extractionFeedbackSchema = new Schema<ExtractionFeedbackRecord>({
	postId: { type: String, required: true, index: true },
	kind: { type: String, enum: FEEDBACK_KINDS, required: true },
	post: { type: Schema.Types.Mixed, required: true },
	aiOutput: { type: Schema.Types.Mixed, required: true },
	expected: { type: Schema.Types.Mixed, default: null },
	correctedFields: { type: [String], default: [] },
	model: { type: String, default: null },
	promptVersion: { type: String, default: null },
	createdAt: { type: Date, required: true },
})

export const ExtractionFeedback = mongoose.model('ExtractionFeedback', extractionFeedbackSchema, 'extraction_feedback')
