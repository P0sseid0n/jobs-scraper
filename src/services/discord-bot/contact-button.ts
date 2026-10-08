import { MessageFlags, type ButtonInteraction } from 'discord.js'

import type { CvRequest } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { buildContactReply, emailFromEmbed, parseContactButton } from './contact-reply'
import type { DiscordReplyContext } from './cv-delivery'

/**
 * Trata o clique em "Contato do recrutador"/"Gerar currículo": responde com o contato (só quem clicou vê)
 * e pede o currículo ao cv-updater, que chega depois como segunda resposta.
 */
export async function handleContactButton(interaction: ButtonInteraction, queue: QueueClient, logger: Logger) {
	const { legacyEmail, postId } = parseContactButton(interaction.customId)
	const embed = interaction.message.embeds[0]

	const email = legacyEmail ?? emailFromEmbed(embed?.fields ?? [])
	// Botões antigos não identificam a vaga: só dá para mostrar o contato
	const generatingCv = postId !== null

	await interaction.reply({
		content: buildContactReply(email, embed?.title ?? null, { generatingCv }),
		flags: MessageFlags.Ephemeral,
	})

	if (!generatingCv) return

	const request: CvRequest = {
		postId,
		requestedBy: interaction.user.id,
		// O cv-updater devolve o contexto sem interpretar; o token permite responder ao clique (vale 15 min)
		replyTo: {
			queue: QUEUES.discordCv,
			context: { applicationId: interaction.applicationId, token: interaction.token } satisfies DiscordReplyContext,
		},
		requestedAt: new Date().toISOString(),
	}
	await queue.publish(QUEUES.cvUpdater, request)

	logger.info({ postId, user: interaction.user.id }, 'Currículo ajustado solicitado')
}
