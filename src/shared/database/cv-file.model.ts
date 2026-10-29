import mongoose, { Schema } from 'mongoose'

import type { ApplicationMessageText } from '../templates/application-message'

/** O e-mail sugerido junto com o currículo. */
export type CvFileDraft = ApplicationMessageText & { fallbacks?: string[] }

export type CvFileDocument = {
	fileId: string
	postId: string
	fileName: string
	pdf: Buffer
	/**
	 * O e-mail sugerido junto com o currículo (a mensagem da IA ou o modelo padrão, já com a assinatura), para o Discord
	 * mostrar na confirmação do envio; `null` quando quem guardou já tem o texto revisado (o site). `fallbacks`: as
	 * variáveis do modelo que a vaga não tinha e usaram o fallback (ausente nos guardados antes do modelo).
	 */
	draft: CvFileDraft | null
	createdAt: Date
}

const KEEP_DAYS = 30

/**
 * PDFs de currículo para anexar à candidatura: o pedido de envio (`MailRequest`) leva só o `fileId`, e o mailer lê o
 * arquivo daqui. O Discord guarda o currículo entregue (ele não fica em outro lugar); o site, o do pedido escolhido.
 */
const cvFileSchema = new Schema<CvFileDocument>(
	{
		fileId: { type: String, required: true, unique: true },
		postId: { type: String, required: true },
		fileName: { type: String, required: true },
		pdf: { type: Buffer, required: true },
		draft: {
			type: new Schema({ subject: String, body: String, fallbacks: { type: [String], default: undefined } }, { _id: false }),
			default: null,
		},
		createdAt: { type: Date, required: true },
	},
	{ versionKey: false },
)

// O MongoDB apaga sozinho os arquivos com mais de 30 dias: para enviar depois disso, gera-se o currículo de novo
cvFileSchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 })

export const CvFile = mongoose.model('CvFile', cvFileSchema, 'cv_files')

/** Guarda o PDF para anexar a uma candidatura; devolve o `fileId`. */
export async function saveCvFile(file: { postId: string; fileName: string; pdf: Buffer; draft?: CvFileDraft | null }) {
	const fileId = crypto.randomUUID()
	await CvFile.create({ ...file, fileId, draft: file.draft ?? null, createdAt: new Date() })

	return fileId
}

/** O PDF guardado, ou `null` se não existe (ou já expirou). */
export function findCvFile(fileId: string) {
	// Sem `.lean()`: com ele o `pdf` vem como `Binary` do BSON, não como Buffer
	return CvFile.findOne({ fileId })
}
