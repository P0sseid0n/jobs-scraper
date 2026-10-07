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
		postedAt: { type: String, default: null },
		author: { type: String, default: null },
		notifiedAt: { type: Date, default: null },
	},
	{ timestamps: true },
)

const JOBS_COLLECTION = 'jobs'
/** Nome antigo da coleção de vagas; migrado automaticamente para `jobs` em `connectDatabase`. */
const LEGACY_JOBS_COLLECTION = 'processed'

export const Job = mongoose.model('Job', jobSchema, JOBS_COLLECTION)

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
		// Sem criação automática: a migração precisa rodar antes de o Mongoose criar a coleção `jobs` vazia
		await mongoose.connect(url, { serverSelectionTimeoutMS: 10_000, autoCreate: false, autoIndex: false })
	} catch (error) {
		throw new Error('Não foi possível conectar ao MongoDB (verifique MONGO_URL e se o container está rodando)', { cause: error })
	}

	await migrateLegacyCollections(logger)
	for (const model of [Job, SeenPost]) {
		await model.createCollection()
		await model.createIndexes()
	}
	logger.info('Conectado ao MongoDB')

	mongoose.connection.on('disconnected', () => logger.warn('Desconectado do MongoDB, o driver vai tentar reconectar'))
	mongoose.connection.on('reconnected', () => logger.info('Reconectado ao MongoDB'))
}

async function collectionExists(name: string) {
	const collections = await mongoose.connection.db!.listCollections({ name }, { nameOnly: true }).toArray()
	return collections.length > 0
}

/** Renomeia a coleção antiga de vagas (`processed`) para `jobs`, mantendo os dados. */
async function migrateLegacyCollections(logger: Logger) {
	if (!(await collectionExists(LEGACY_JOBS_COLLECTION)) || (await collectionExists(JOBS_COLLECTION))) return

	try {
		await mongoose.connection.db!.renameCollection(LEGACY_JOBS_COLLECTION, JOBS_COLLECTION)
		logger.info({ from: LEGACY_JOBS_COLLECTION, to: JOBS_COLLECTION }, 'Coleção de vagas renomeada')
	} catch (error) {
		// Outro serviço (storage/post-processing sobem juntos) pode ter feito a migração ao mesmo tempo
		if (!(await collectionExists(JOBS_COLLECTION))) throw error
	}
}

export function disconnectDatabase() {
	return mongoose.disconnect()
}
