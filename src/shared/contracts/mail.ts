import { z } from 'zod'

import { ReplyToSchema } from './cv'

/** Limites do e-mail de candidatura: o assunto numa linha, o corpo bem acima de qualquer mensagem de candidatura. */
export const MAIL_SUBJECT_MAX = 300
export const MAIL_BODY_MAX = 20_000

/** O assunto vai no cabeçalho do e-mail: numa linha só (uma quebra ali estragaria o cabeçalho). */
export const MailSubjectSchema = z
	.string()
	.transform(subject => subject.replace(/\s*[\r\n]+\s*/g, ' ').trim())
	.pipe(z.string().min(1, 'O assunto está vazio').max(MAIL_SUBJECT_MAX))

export const MailBodySchema = z.string().trim().min(1, 'A mensagem está vazia').max(MAIL_BODY_MAX)

/** O e-mail do recrutador, sem espaços nas pontas. */
export const MailAddressSchema = z.string().trim().pipe(z.email('E-mail inválido'))

/**
 * Mensagem da fila `mailer`: enviar a candidatura por e-mail. O envio já foi registrado (`mailId`, coleção
 * `application_mails`) por quem pediu, depois da confirmação de quem clicou; o PDF do currículo vai por referência
 * (`attachment.fileId`, coleção `cv_files`) para a mensagem não carregar o arquivo. O resultado volta em
 * `replyTo.queue`, com o contexto, como nos pedidos de currículo.
 */
export const MailRequestSchema = z.object({
	mailId: z.string().min(1),
	postId: z.string().min(1),
	to: MailAddressSchema,
	subject: MailSubjectSchema,
	body: MailBodySchema,
	attachment: z.object({ fileId: z.string().min(1) }),
	requestedBy: z.string().min(1),
	replyTo: ReplyToSchema,
	requestedAt: z.iso.datetime(),
})

export type MailRequest = z.infer<typeof MailRequestSchema>

/** Situação de um envio: `sending` enquanto o mailer não terminou (inclusive entre as novas tentativas). */
export const MAIL_STATUSES = ['sending', 'sent', 'failed'] as const
export type MailStatus = (typeof MAIL_STATUSES)[number]

/** Mensagem da fila indicada em `replyTo.queue`: a candidatura enviada (ou o motivo da falha), com o contexto do pedido. */
export const MailResultSchema = z.object({
	mailId: z.string().min(1),
	postId: z.string().min(1),
	context: z.record(z.string(), z.unknown()),
	status: z.enum(['sent', 'failed']),
	/** O motivo da falha, para mostrar no canal; `null` no envio que deu certo. */
	error: z.string().nullable(),
	sentAt: z.iso.datetime().nullable(),
})

export type MailResult = z.infer<typeof MailResultSchema>
