import type { MailRequest, MailResult } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { PermanentError, type Delivery } from '@shared/messaging'

import { composeMail, type MailAttachmentFile } from './compose-mail'
import { classifyMailError } from './mail-errors'
import type { MailTransport } from './mail-transport'

/** O provedor e o remetente da conta em uso; `null` sem conta de e-mail configurada. */
export type MailAccount = { transport: MailTransport; from: string }

/** O registro do envio (coleção `application_mails`), como o mailer o lê e atualiza. */
export type MailRecords = {
	status(mailId: string): Promise<'sending' | 'sent' | 'failed' | null>
	markSent(mailId: string, sentAt: Date): Promise<void>
	markFailed(mailId: string, error: string): Promise<void>
	/** Uma tentativa falhou por erro transitório e a mensagem volta para a fila. */
	noteRetry(mailId: string, error: string): Promise<void>
}

/** Tudo de fora que o envio usa: trocado nos testes por versões em memória, sem banco, fila nem e-mail de verdade. */
export type SendDeps = {
	account: () => Promise<MailAccount | null>
	records: MailRecords
	findFile: (fileId: string) => Promise<MailAttachmentFile | null>
	/** Publica o resultado na fila de `replyTo` de quem pediu. */
	reply: (queue: string, result: MailResult) => Promise<void>
	/** Marca a candidatura na vaga (o selo "candidatura enviada" nos canais). */
	markApplied: (postId: string) => Promise<void>
	logger: Logger
}

export const NO_ACCOUNT_ERROR =
	'Envio por e-mail desligado: configure a conta de e-mail (SMTP) em Configurações › Contas ou no .env (SMTP_HOST, SMTP_USER, SMTP_PASS).'

export const MISSING_FILE_ERROR = 'O currículo anexado não existe mais (os PDFs ficam 30 dias). Gere o currículo de novo e reenvie.'

/**
 * Envia a candidatura pedida e devolve o resultado a quem pediu:
 * - envio já feito (a mesma mensagem entregue de novo pela fila) só repete o resultado, sem mandar outro e-mail;
 * - sem conta de e-mail ou sem o PDF, falha na hora;
 * - erro transitório do provedor volta para a fila (lança o erro); na última tentativa, vira falha;
 * - erro permanente vira falha e a mensagem vai para a DLQ (`PermanentError`), depois de avisar quem pediu.
 * Nos logs, só os IDs: o endereço e o texto do e-mail ficam fora.
 */
export async function sendApplication(request: MailRequest, delivery: Delivery, deps: SendDeps) {
	const log = deps.logger.child({ mailId: request.mailId, postId: request.postId, replyTo: request.replyTo.queue })
	const reply = (result: Pick<MailResult, 'status' | 'error' | 'sentAt'>) =>
		deps.reply(request.replyTo.queue, {
			mailId: request.mailId,
			postId: request.postId,
			context: request.replyTo.context,
			...result,
		})

	const fail = async (error: string) => {
		await deps.records.markFailed(request.mailId, error)
		await reply({ status: 'failed', error, sentAt: null })
	}

	const status = await deps.records.status(request.mailId)
	if (status === 'sent') {
		log.info('Candidatura já enviada antes; repetindo o resultado')
		await reply({ status: 'sent', error: null, sentAt: new Date().toISOString() })
		return
	}
	if (status === null) {
		// Quem pede registra antes de publicar: sem registro, não houve a confirmação de quem clicou
		log.warn('Envio sem registro no banco, ignorando')
		return
	}

	const account = await deps.account()
	if (!account) {
		log.warn('Candidatura pedida sem conta de e-mail configurada')
		await fail(NO_ACCOUNT_ERROR)
		return
	}

	const file = await deps.findFile(request.attachment.fileId)
	if (!file) {
		log.warn({ fileId: request.attachment.fileId }, 'Currículo anexado não encontrado')
		await fail(MISSING_FILE_ERROR)
		return
	}

	log.info({ retries: delivery.retries }, 'Enviando candidatura por e-mail')

	try {
		await account.transport.send(composeMail(request, file, account.from))
	} catch (error) {
		const { kind, reason } = classifyMailError(error)
		// A resposta do servidor costuma citar o endereço: só no debug. O erro que segue para a fila leva só o motivo
		log.debug({ err: error }, 'Resposta do provedor de e-mail')

		if (kind === 'transient' && !delivery.finalAttempt) {
			await deps.records.noteRetry(request.mailId, reason)
			throw new Error(reason)
		}

		await fail(reason)
		throw new PermanentError(reason)
	}

	const sentAt = new Date()
	await deps.records.markSent(request.mailId, sentAt)
	await deps.markApplied(request.postId)
	await reply({ status: 'sent', error: null, sentAt: sentAt.toISOString() })

	log.info('Candidatura enviada por e-mail')
}
