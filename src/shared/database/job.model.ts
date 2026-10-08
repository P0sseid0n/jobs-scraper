import mongoose, { Schema } from 'mongoose'

import { WORK_MODES, type ProcessedJob } from '../contracts/job'

type JobDocument = ProcessedJob & { notifiedAt: Date | null }

const jobSchema = new Schema<JobDocument>(
	{
		// sparse: documentos antigos (sem postId) não entram no índice único
		postId: { type: String, required: true, unique: true, sparse: true },
		rawContent: { type: String, required: true },
		title: { type: String, default: null },
		company: { type: String, default: null },
		location: { type: String, default: null },
		link: { type: String, default: null },
		necessary_knowledge: { type: [String], default: null },
		recruiter_email: { type: String, default: null },
		workMode: { type: String, enum: [...WORK_MODES, null], default: null },
		aiJobConfidence: { type: Number, required: true },
		postedAt: { type: String, default: null },
		author: { type: String, default: null },
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export const Job = mongoose.model('Job', jobSchema, 'jobs')
