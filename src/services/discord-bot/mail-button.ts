import { MessageFlags, type ButtonInteraction } from 'discord.js'

import type { MailRequest } from '@shared/contracts'
import { ApplicationMail, createApplicationMail, CvFile, Job, mailBlockers } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials } from '@shared/settings'

import type { DiscordReplyContext } from './cv-delivery'
import { buildMailConfirmation, confirmationRow, MAIL_BUTTON_PREFIX, MAIL_SEND_PREFIX } from './mail-reply'

const NO_ACCOUNT = '✉️ O envio por e-mail está desligado: configure a conta de e-mail em Configurações › Contas, no site.'
const EXPIRED = '📄 Este currículo não está mais guardado (os PDFs ficam 30 dias). Gere o currículo de novo pelo card da vaga.'
const SENDING = '📤 Já há um envio desta candidatura em andamento.'

/** O que o envio precisa, conferido a cada clique: o currículo guardado, a vaga com e-mail e a conta de e-mail. */
async function loadSendable(fileId: string): Promise<{ error: string } | { error: null; file: SendableFile; to: string }> {
	const file = await CvFile.findOne({ fileId }, { postId: 1, fileName: 1, draft: 1 }).lean<SendableFile>()
	if (!file?.draft) return { error: EXPIRED }

	const job = await Job.findOne({ postId: file.postId }, { recruiterEmail: 1 }).lean()
	if (!job?.recruiterEmail) return { error: 'Essa vaga não tem e-mail de contato.' }
	if (!(await loadCredentials('smtp'))) return { error: NO_ACCOUNT }

	return { error: null, file, to: job.recruiterEmail }
}

type SendableFile = { postId: string; fileName: string; draft: { subject: string; body: string } | null }

/** "Enviar candidatura" (ou "Tentar de novo"): mostra a confirmação, com o e-mail como vai e o aviso de reenvio. */
export async function handleMailButton(interaction: ButtonInteraction) {
	const fileId = interaction.customId.slice(MAIL_BUTTON_PREFIX.length)
	const sendable = await loadSendable(fileId)
	if (sendable.error !== null) {
		await interaction.reply({ content: sendable.error, flags: MessageFlags.Ephemeral })
		return
	}

	const { file, to } = sendable
	const { sending, sent } = await mailBlockers(file.postId)
	if (sending) {
		await interaction.reply({ content: SENDING, flags: MessageFlags.Ephemeral })
		return
	}

	await interaction.reply({
		content: buildMailConfirmation({
			to,
			subject: file.draft!.subject,
			body: file.draft!.body,
			fileName: file.fileName,
			lastSentAt: sent ? (sent.sentAt ?? sent.requestedAt) : null,
		}),
		components: [confirmationRow(fileId, !!sent)],
		flags: MessageFlags.Ephemeral,
	})
}

/**
 * "Confirmar envio": registra o envio e o pede ao mailer; a confirmação vira "enviando" e, quando o resultado voltar
 * (fila `discord-mail`), mostra se saiu ou por que falhou.
 */
export async function handleMailSend(interaction: ButtonInteraction, queue: QueueClient, logger: Logger) {
	const fileId = interaction.customId.slice(MAIL_SEND_PREFIX.length)
	const sendable = await loadSendable(fileId)
	if (sendable.error !== null) {
		await interaction.update({ content: sendable.error, components: [] })
		return
	}

	const { file, to } = sendable
	// Dois cliques seguidos no "Confirmar" não mandam dois e-mails
	if ((await mailBlockers(file.postId)).sending) {
		await interaction.update({ content: SENDING, components: [] })
		return
	}

	const mail = await createApplicationMail({
		postId: file.postId,
		channel: 'discord',
		to,
		subject: file.draft!.subject,
		body: file.draft!.body,
		fileId,
		fileName: file.fileName,
	})

	const request: MailRequest = {
		mailId: mail.mailId,
		postId: file.postId,
		to,
		subject: mail.subject,
		body: mail.body,
		attachment: { fileId },
		requestedBy: interaction.user.id,
		// O mailer devolve o contexto sem interpretar; o token permite editar a confirmação (vale 15 min)
		replyTo: {
			queue: QUEUES.discordMail,
			context: { applicationId: interaction.applicationId, token: interaction.token } satisfies DiscordReplyContext,
		},
		requestedAt: mail.requestedAt.toISOString(),
	}

	await interaction.update({ content: `📤 Enviando a candidatura para **${to}**…`, components: [] })
	try {
		await queue.publish(QUEUES.mailer, request)
	} catch (error) {
		await ApplicationMail.updateOne(
			{ mailId: mail.mailId },
			{ status: 'failed', error: 'Não consegui pedir o envio ao mailer.', finishedAt: new Date() },
		)
		throw error
	}

	logger.info({ postId: file.postId, mailId: mail.mailId, user: interaction.user.id }, 'Candidatura por e-mail pedida pelo Discord')
}

/** "Cancelar": a confirmação some e nada é enviado. */
export async function handleMailCancel(interaction: ButtonInteraction) {
	await interaction.update({ content: 'Envio cancelado: nenhum e-mail foi enviado.', components: [] })
}
