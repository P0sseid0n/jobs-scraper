import mongoose, { Schema } from 'mongoose'
import { type ProcessedJob, WORK_MODES } from '../types/messages'
import type { Logger } from './logger'

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
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

export const Job = mongoose.model('Job', jobSchema, 'processed')

/** Todo post que já passou pela IA (sendo vaga ou não), para não reprocessar o mesmo conteúdo. */
const seenPostSchema = new Schema(
	{
		postId: { type: String, required: true, unique: true },
		isJob: { type: Boolean, required: true },
	},
	{ timestamps: true },
)

export const SeenPost = mongoose.model('SeenPost', seenPostSchema, 'seen_posts')

export async function connectDatabase(url: string, logger: Logger) {
	try {
		await mongoose.connect(url, { serverSelectionTimeoutMS: 10_000 })
	} catch (error) {
		throw new Error('Não foi possível conectar ao MongoDB (verifique MONGO_URL e se o container está rodando)', { cause: error })
	}
	await Promise.all([Job.init(), SeenPost.init()])
	logger.info('Conectado ao MongoDB')

	mongoose.connection.on('disconnected', () => logger.warn('Desconectado do MongoDB, o driver vai tentar reconectar'))
	mongoose.connection.on('reconnected', () => logger.info('Reconectado ao MongoDB'))
}

export function disconnectDatabase() {
	return mongoose.disconnect()
}
