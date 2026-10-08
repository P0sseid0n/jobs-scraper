import { MessageFlags, type ButtonInteraction } from 'discord.js'

import type { CvRequest } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { buildContactReply, emailFromEmbed, parseContactButton } from './contact-reply'

/**
 * Clique em "Contato do recrutador" / "Gerar currículo": responde na hora com o contato (só para quem clicou)
 * e pede o currículo ajustado ao cv-updater, que chega depois como uma segunda resposta.
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
		interaction: { applicationId: interaction.applicationId, token: interaction.token },
		requestedAt: new Date().toISOString(),
	}
	await queue.publish(QUEUES.cvUpdater, request)

	logger.info({ postId, user: interaction.user.id }, 'Currículo ajustado solicitado')
}
