import mongoose, { Schema } from 'mongoose'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type ApplicationMessage, type CvChanges } from '@shared/contracts'

import { CV_STATUSES, type CvStatus, type WebCvRequest } from '../api-types'

/** Mensagens de antes do tom e do tamanho não têm esses campos. */
type StoredMessage = Omit<ApplicationMessage, 'tone' | 'length'> & Partial<Pick<ApplicationMessage, 'tone' | 'length'>>

type CvRequestDocument = {
	requestId: string
	postId: string
	jobTitle: string | null
	company: string | null
	status: CvStatus
	fileName: string | null
	pdf: Buffer | null
	error: string | null
	/** E-mail de candidatura gerado pela IA; pedidos de antes do campo não o têm. */
	message?: StoredMessage | null
	/** A versão de antes da última reescrita pelo site (tom, tamanho, "mais direta"), para desfazer. */
	previousMessage?: StoredMessage | null
	/** O ajuste feito para a vaga; pedidos de antes do campo não o têm. */
	changes?: CvChanges | null
	/** De qual currículo base o PDF saiu (`versionId` `null`: o arquivo); `null` na falha e nos pedidos de antes do campo. */
	base?: { versionId: string | null } | null
	requestedAt: Date
	finishedAt: Date | null
}

const HISTORY_DAYS = 90

const messageSchema = new Schema(
	{
		subject: { type: String, required: true },
		body: { type: String, required: true },
		tone: { type: String, enum: [...MESSAGE_TONES, null], default: null },
		length: { type: String, enum: [...MESSAGE_LENGTHS, null], default: null },
	},
	{ _id: false },
)

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
		message: { type: messageSchema, default: null },
		previousMessage: { type: messageSchema, default: null },
		changes: {
			type: new Schema(
				{
					addedSkills: { type: [String], default: [] },
					removedSkills: { type: [String], default: [] },
					summary: { type: new Schema({ before: String, after: String }, { _id: false }), default: null },
					projects: { type: [String], default: [] },
				},
				{ _id: false },
			),
			default: null,
		},
		base: { type: new Schema({ versionId: { type: String, default: null } }, { _id: false }), default: null },
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
		message: toWebMessage(doc.message),
		previousMessage: toWebMessage(doc.previousMessage),
		changes: doc.changes
			? {
					addedSkills: [...doc.changes.addedSkills],
					removedSkills: [...doc.changes.removedSkills],
					summary: doc.changes.summary ? { before: doc.changes.summary.before, after: doc.changes.summary.after } : null,
					projects: [...doc.changes.projects],
				}
			: null,
		base: doc.base ? { versionId: doc.base.versionId ?? null } : null,
		requestedAt: doc.requestedAt.toISOString(),
		finishedAt: doc.finishedAt?.toISOString() ?? null,
	}
}

function toWebMessage(message: StoredMessage | null | undefined): ApplicationMessage | null {
	return message ? { subject: message.subject, body: message.body, tone: message.tone ?? null, length: message.length ?? null } : null
}
