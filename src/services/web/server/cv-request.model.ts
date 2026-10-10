import mongoose, { Schema } from 'mongoose'

import { CV_STATUSES, type CvStatus, type WebCvRequest } from '../api-types'

type CvRequestDocument = {
	requestId: string
	postId: string
	jobTitle: string | null
	company: string | null
	status: CvStatus
	fileName: string | null
	pdf: Buffer | null
	error: string | null
	requestedAt: Date
	finishedAt: Date | null
}

const HISTORY_DAYS = 90

/** Currículos pedidos pelo site, com o PDF: a lista "Meus currículos" baixa de novo sem gerar outro. */
const cvRequestSchema = new Schema<CvRequestDocument>(
	{
		requestId: { type: String, required: true, unique: true },
		postId: { type: String, required: true, index: true },
		jobTitle: { type: String, default: null },
		company: { type: String, default: null },
		status: { type: String, enum: CV_STATUSES, required: true },
		fileName: { type: String, default: null },
		pdf: { type: Buffer, default: null },
		error: { type: String, default: null },
		requestedAt: { type: Date, required: true },
		finishedAt: { type: Date, default: null },
	},
	{ versionKey: false },
)

// Mais recentes primeiro; o MongoDB apaga sozinho os pedidos com mais de 90 dias
cvRequestSchema.index({ requestedAt: -1 }, { expireAfterSeconds: HISTORY_DAYS * 24 * 60 * 60 })

export const CvRequestRecord = mongoose.model('WebCvRequest', cvRequestSchema, 'web_cv_requests')

/** Sem resposta do cv-updater nesse tempo, o pedido é dado como falho (o serviço pode estar parado). */
export const CV_TIMEOUT_MS = 10 * 60 * 1000

export const CV_TIMEOUT_ERROR = 'O cv-updater não respondeu em 10 minutos. Confira se ele está rodando e tente de novo.'

/** Converte o documento no formato da API; pedidos pendentes há tempo demais aparecem como falhos. */
export function toWebCvRequest(doc: Omit<CvRequestDocument, 'pdf'>, now = new Date()): WebCvRequest {
	const timedOut = doc.status === 'pending' && now.getTime() - doc.requestedAt.getTime() > CV_TIMEOUT_MS

	return {
		requestId: doc.requestId,
		postId: doc.postId,
		jobTitle: doc.jobTitle,
		company: doc.company,
		status: timedOut ? 'failed' : doc.status,
		fileName: doc.fileName,
		error: timedOut ? CV_TIMEOUT_ERROR : doc.error,
		requestedAt: doc.requestedAt.toISOString(),
		finishedAt: doc.finishedAt?.toISOString() ?? null,
	}
}
