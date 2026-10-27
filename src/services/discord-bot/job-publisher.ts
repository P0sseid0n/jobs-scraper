import { ChannelType, type Client, type ForumChannel, type SendableChannels } from 'discord.js'

import type { JobPublished } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import { buildJobCard, buildThreadName, pickForumTags, type JobCardImage } from './job-card'

export type JobChannel = SendableChannels | ForumChannel

/** Busca o canal configurado (texto ou fórum); `null` se ele não existe, o bot não o vê ou não aceita mensagens. */
export async function resolveJobChannel(client: Client<true>, channelId: string, logger: Logger): Promise<JobChannel | null> {
	const channel = await client.channels.fetch(channelId).catch(() => null)
	const isForum = channel?.type === ChannelType.GuildForum

	if (!channel || (!isForum && !(channel.isTextBased() && channel.isSendable()))) {
		logger.error(
			{ channelId },
			'Canal do Discord inválido ou sem permissão para mensagens (use um canal de texto ou de fórum): confira o ID em Configurações › Contas',
		)
		return null
	}

	logger.info({ channelId, forum: isForum }, isForum ? 'Publicando vagas como posts do fórum' : 'Publicando vagas no canal')
	return channel as JobChannel
}

/** Publica a vaga: num fórum, como post próprio com tags; num canal de texto, como mensagem. */
export async function publishJob(channel: JobChannel, job: JobPublished, image: JobCardImage | null = null) {
	const card = buildJobCard(job, image)

	if (channel.type === ChannelType.GuildForum) {
		await channel.threads.create({
			name: buildThreadName(job),
			message: card,
			appliedTags: pickForumTags(job, channel.availableTags),
		})
		return
	}

	await channel.send(card)
}
