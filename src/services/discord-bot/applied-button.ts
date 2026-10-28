import { ComponentType, MessageFlags, type ButtonInteraction } from 'discord.js'

import type { JobAppliedChange } from '@shared/contracts'
import { Job, setJobApplied } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { APPLIED_BUTTON_PREFIX, withAppliedButton } from './job-card'

/**
 * Trata o clique em "Já me candidatei": marca a candidatura no banco (ou desmarca, se a vaga já estava marcada, pelo
 * Discord ou pelo site), troca o botão do card pelo do novo estado e avisa o site, que atualiza os navegadores abertos.
 */
export async function handleAppliedButton(interaction: ButtonInteraction, queue: QueueClient, logger: Logger) {
	const postId = interaction.customId.slice(APPLIED_BUTTON_PREFIX.length)

	// O estado do banco decide, não o do botão: a vaga pode ter sido marcada ou desmarcada no site depois
	const current = await Job.findOne({ postId }, { appliedAt: 1 }).lean()
	const result = current && (await setJobApplied(postId, !current.appliedAt))
	if (!result) {
		await interaction.reply({ content: 'Não achei esta vaga no banco.', flags: MessageFlags.Ephemeral })
		return
	}

	const applied = result.appliedAt !== null
	const rows = interaction.message.components.flatMap(row => (row.type === ComponentType.ActionRow ? [row.toJSON()] : []))
	await interaction.update({ components: withAppliedButton(rows, postId, applied) })

	if (result.changed) {
		const change: JobAppliedChange = { postId, appliedAt: result.appliedAt?.toISOString() ?? null }
		await queue.publish(QUEUES.webApplied, change)
	}

	logger.info(
		{ postId, applied, user: interaction.user.id },
		applied ? 'Candidatura marcada pelo Discord' : 'Candidatura desmarcada pelo Discord',
	)
}
