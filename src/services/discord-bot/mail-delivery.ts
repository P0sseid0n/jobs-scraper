import { Routes, type Client } from 'discord.js'

import type { MailResult } from '@shared/contracts'
import { ApplicationMail } from '@shared/database'
import type { Logger } from '@shared/logging'
import { PermanentError } from '@shared/messaging'

import { DiscordReplyContextSchema } from './cv-delivery'
import { isExpiredInteraction, toQueueError } from './discord-errors'
import { mailResultContent, sendApplicationRow } from './mail-reply'

/**
 * Mostra o resultado do envio na confirmação em que a pessoa clicou (só ela vê): enviada, ou o motivo da falha com o
 * "Tentar de novo". O token da interação vale 15 min.
 */
export async function deliverMailResult(client: Client, result: MailResult, logger: Logger) {
	const context = DiscordReplyContextSchema.safeParse(result.context)
	if (!context.success) throw new PermanentError('Resultado de envio sem a interação do Discord no contexto')

	const mail = await ApplicationMail.findOne({ mailId: result.mailId }, { to: 1, fileId: 1 }).lean()
	if (!mail) {
		logger.warn({ mailId: result.mailId }, 'Envio não encontrado no banco, ignorando')
		return
	}

	try {
		await client.rest.patch(Routes.webhookMessage(context.data.applicationId, context.data.token), {
			auth: false,
			body: {
				content: mailResultContent(result, mail.to),
				components: result.status === 'failed' ? [sendApplicationRow(mail.fileId, true)] : [],
			},
		})
	} catch (error) {
		if (isExpiredInteraction(error)) {
			logger.warn({ mailId: result.mailId }, 'Interação expirada; resultado do envio não mostrado (ele fica no site)')
			return
		}

		throw toQueueError(error)
	}

	logger.info({ postId: result.postId, mailId: result.mailId, status: result.status }, 'Resultado do envio mostrado no Discord')
}
