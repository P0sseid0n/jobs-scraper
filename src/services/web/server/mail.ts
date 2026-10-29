import { z } from 'zod'

import { MailAddressSchema, MailBodySchema, MailSubjectSchema, type MailRequest, type MailResult } from '@shared/contracts'
import {
	ApplicationMail,
	createApplicationMail,
	effectiveMailStatus,
	findActiveCvBaseName,
	Job,
	listApplicationMails,
	mailBlockers,
	saveCvFile,
	type ApplicationMailDocument,
} from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials } from '@shared/settings'

import { senderOf } from '../../mailer/mail-transport'
import type { WebMail, WebMailSetup } from '../api-types'
import { CvRequestRecord } from './cv-request.model'
import type { EventHub } from './event-hub'
import { HttpError, readJson } from './http'
import { LISTABLE_JOBS } from './jobs-query'

type Deps = { queue: QueueClient; events: EventHub; logger: Logger }

/** O contexto que o site manda no `replyTo` do envio: o id do envio, para achar o registro quando o resultado voltar. */
const WebMailContextSchema = z.object({ mailId: z.uuid() })

export const MailDraftSchema = z.object({
	requestId: z.uuid('Escolha o currículo a anexar'),
	to: MailAddressSchema,
	subject: MailSubjectSchema,
	body: MailBodySchema,
	force: z.boolean().default(false),
})

/** O registro no formato da API: envio sem resposta há tempo demais aparece como falho. */
export function toWebMail(doc: ApplicationMailDocument, now = new Date()): WebMail {
	const { status, error } = effectiveMailStatus(doc, now)

	return {
		mailId: doc.mailId,
		postId: doc.postId,
		channel: doc.channel,
		to: doc.to,
		subject: doc.subject,
		fileName: doc.fileName,
		status,
		error,
		requestedAt: doc.requestedAt.toISOString(),
		sentAt: doc.sentAt?.toISOString() ?? null,
	}
}

/** `GET /api/mail`: se há conta de e-mail (site ou `.env`) para enviar as candidaturas, e o remetente. */
export async function mailSetup() {
	const account = (await loadCredentials('smtp'))?.value

	return Response.json({
		enabled: !!account,
		from: account ? senderOf(account, await findActiveCvBaseName()) : null,
	} satisfies WebMailSetup)
}

/** `GET /api/jobs/:postId/mails`: as candidaturas por e-mail da vaga, da mais recente à mais antiga. */
export async function listJobMails(req: Request & { params: { postId: string } }) {
	const docs = await listApplicationMails(req.params.postId)
	const now = new Date()

	return Response.json(docs.map(doc => toWebMail(doc, now)) satisfies WebMail[])
}

/**
 * `POST /api/jobs/:postId/mail`: envia a candidatura revisada na prévia (só depois de quem clicou confirmar), com o PDF
 * do pedido de currículo escolhido. Responde 202 com o envio registrado; o resultado chega pelo stream (`mail`).
 * Recusa (409) com um envio em andamento e, sem `force`, quando a vaga já recebeu candidatura por e-mail.
 */
export async function sendJobMail(req: Request & { params: { postId: string } }, { queue, events, logger }: Deps) {
	const { postId } = req.params
	const draft = MailDraftSchema.parse(await readJson(req))

	if (!(await loadCredentials('smtp'))) {
		throw new HttpError(409, 'Envio por e-mail desligado: configure a conta de e-mail em Configurações › Contas.')
	}

	if (!(await Job.exists({ ...LISTABLE_JOBS, postId }))) throw new HttpError(404, 'Vaga não encontrada')

	// Sem `.lean()`: com ele o `pdf` vem como `Binary` do BSON, não como Buffer
	const cv = await CvRequestRecord.findOne({ requestId: draft.requestId, postId, status: 'ready' }, { pdf: 1, fileName: 1 })
	if (!cv?.pdf) throw new HttpError(409, 'O currículo desta vaga não está pronto: gere o currículo antes de enviar.')

	const { sending, sent } = await mailBlockers(postId)
	if (sending) throw new HttpError(409, 'Já há um envio desta candidatura em andamento.')
	if (sent && !draft.force) {
		throw new HttpError(409, 'Esta vaga já recebeu candidatura por e-mail. Confirme para enviar de novo.')
	}

	const fileName = cv.fileName ?? 'Curriculo.pdf'
	const fileId = await saveCvFile({ postId, fileName, pdf: cv.pdf })
	const mail = await createApplicationMail({
		postId,
		channel: 'web',
		to: draft.to,
		subject: draft.subject,
		body: draft.body,
		fileId,
		fileName,
	})

	const request: MailRequest = {
		mailId: mail.mailId,
		postId,
		to: mail.to,
		subject: mail.subject,
		body: mail.body,
		attachment: { fileId },
		requestedBy: 'web',
		replyTo: { queue: QUEUES.webMail, context: { mailId: mail.mailId } },
		requestedAt: mail.requestedAt.toISOString(),
	}

	try {
		await queue.publish(QUEUES.mailer, request)
	} catch (error) {
		await ApplicationMail.updateOne(
			{ mailId: mail.mailId },
			{ status: 'failed', error: 'Não consegui pedir o envio ao mailer.', finishedAt: new Date() },
		)
		throw error
	}

	const result = toWebMail(mail)
	events.broadcast('mail', result)
	logger.info({ postId, mailId: mail.mailId, resend: !!sent }, 'Candidatura por e-mail pedida pelo site')

	return Response.json(result satisfies WebMail, { status: 202 })
}

/** Consumidor da fila `web-mail`: o mailer já atualizou o registro; avisa os navegadores conectados. */
export async function saveMailResult(result: MailResult, { events, logger }: Omit<Deps, 'queue'>) {
	const context = WebMailContextSchema.safeParse(result.context)
	if (!context.success) {
		logger.warn({ postId: result.postId }, 'Resultado de envio sem o id do site, ignorando')
		return
	}

	const doc = await ApplicationMail.findOne({ mailId: context.data.mailId }).lean()
	if (!doc) {
		logger.warn({ mailId: context.data.mailId }, 'Envio não encontrado no banco, ignorando')
		return
	}

	events.broadcast('mail', toWebMail(doc))
	logger.info({ postId: result.postId, mailId: doc.mailId, status: doc.status }, 'Resultado do envio recebido')
}
