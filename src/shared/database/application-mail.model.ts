import mongoose, { Schema } from 'mongoose'

import { MAIL_STATUSES, type MailStatus } from '../contracts/mail'

/** Por onde a candidatura foi enviada. */
export const MAIL_CHANNELS = ['web', 'discord'] as const
export type MailChannel = (typeof MAIL_CHANNELS)[number]

export type ApplicationMailDocument = {
	mailId: string
	postId: string
	channel: MailChannel
	to: string
	subject: string
	body: string
	fileId: string
	fileName: string
	status: MailStatus
	/** O motivo da falha (ou, enviando, o da última tentativa que falhou); `null` sem falha. */
	error: string | null
	/** Tentativas que falharam por erro transitório e voltaram para a fila. */
	retries: number
	requestedAt: Date
	sentAt: Date | null
	finishedAt: Date | null
}

/**
 * Cada candidatura enviada por e-mail (ou tentada), registrada por quem pediu antes de publicar o pedido e atualizada
 * pelo mailer: os canais mostram o status e avisam antes de mandar de novo para a mesma vaga.
 */
const applicationMailSchema = new Schema<ApplicationMailDocument>(
	{
		mailId: { type: String, required: true, unique: true },
		postId: { type: String, required: true },
		channel: { type: String, enum: MAIL_CHANNELS, required: true },
		to: { type: String, required: true },
		subject: { type: String, required: true },
		body: { type: String, required: true },
		fileId: { type: String, required: true },
		fileName: { type: String, required: true },
		status: { type: String, enum: MAIL_STATUSES, required: true },
		error: { type: String, default: null },
		retries: { type: Number, default: 0 },
		requestedAt: { type: Date, required: true },
		sentAt: { type: Date, default: null },
		finishedAt: { type: Date, default: null },
	},
	{ versionKey: false },
)

applicationMailSchema.index({ postId: 1, requestedAt: -1 })

export const ApplicationMail = mongoose.model('ApplicationMail', applicationMailSchema, 'application_mails')

/** Sem resposta do mailer nesse tempo, o envio é dado como falho (o serviço pode estar parado). */
export const MAIL_TIMEOUT_MS = 10 * 60 * 1000

export const MAIL_TIMEOUT_ERROR = 'O mailer não respondeu em 10 minutos. Confira se ele está rodando e tente de novo.'

/** O envio como os canais o mostram: `sending` há tempo demais conta como falho. */
export function effectiveMailStatus(doc: Pick<ApplicationMailDocument, 'status' | 'error' | 'requestedAt'>, now = new Date()) {
	const timedOut = doc.status === 'sending' && now.getTime() - doc.requestedAt.getTime() > MAIL_TIMEOUT_MS

	return timedOut ? { status: 'failed' as const, error: MAIL_TIMEOUT_ERROR } : { status: doc.status, error: doc.error }
}

/** Registra o envio confirmado por quem clicou, como `sending`; devolve o documento. */
export async function createApplicationMail(
	mail: Pick<ApplicationMailDocument, 'postId' | 'channel' | 'to' | 'subject' | 'body' | 'fileId' | 'fileName'>,
) {
	const doc = await ApplicationMail.create({
		...mail,
		mailId: crypto.randomUUID(),
		status: 'sending',
		error: null,
		retries: 0,
		requestedAt: new Date(),
	})

	return doc.toObject()
}

/** Os envios da vaga, do mais recente ao mais antigo. */
export function listApplicationMails(postId: string) {
	return ApplicationMail.find({ postId }).sort({ requestedAt: -1 }).lean()
}

/**
 * O que impede de enviar sem perguntar: um envio em andamento (dentro do prazo) ou a candidatura mais recente já
 * enviada para a vaga.
 */
export async function mailBlockers(postId: string, now = new Date()) {
	const [sending, sent] = await Promise.all([
		ApplicationMail.findOne({ postId, status: 'sending', requestedAt: { $gt: new Date(now.getTime() - MAIL_TIMEOUT_MS) } }).lean(),
		ApplicationMail.findOne({ postId, status: 'sent' }).sort({ sentAt: -1 }).lean(),
	])

	return { sending, sent }
}
