import mongoose, { Schema } from 'mongoose'

import { CONTRACT_TYPES, WORK_MODES, type ProcessedJob } from '../contracts/job'

type JobDocument = ProcessedJob & { notifiedAt: Date | null }

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
		aiJobConfidence: { type: Number, required: true },
		postedAt: { type: String, default: null },
		author: { type: String, default: null },
		language: { type: String, default: null },
		sourcePostId: { type: String, default: null },
		postLink: { type: String, default: null },
		// Quando o evento `job-published` foi publicado (com pelo menos uma fila ligada); não confirma a entrega
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export const Job = mongoose.model('Job', jobSchema, 'jobs')
