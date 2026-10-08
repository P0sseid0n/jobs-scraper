import { ChannelType, type Client, type ForumChannel, type SendableChannels } from 'discord.js'

import type { ProcessedJob } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import { buildJobCard, buildThreadName, pickForumTags } from './job-card'

export type JobChannel = SendableChannels | ForumChannel

/** Busca o canal configurado (texto ou fórum). */
export async function resolveJobChannel(client: Client<true>, channelId: string, logger: Logger): Promise<JobChannel> {
	const channel = await client.channels.fetch(channelId).catch(() => null)
	const isForum = channel?.type === ChannelType.GuildForum

	if (!channel || (!isForum && !(channel.isTextBased() && channel.isSendable()))) {
		logger.fatal({ channelId }, 'DISCORD_CHANNEL_ID inválido ou o canal não aceita mensagens (use um canal de texto ou de fórum)')
		process.exit(1)
	}

	logger.info({ channelId, forum: isForum }, isForum ? 'Publicando vagas como posts do fórum' : 'Publicando vagas no canal')
	return channel as JobChannel
}

/** Publica a vaga: num fórum, como post próprio com tags; num canal de texto, como mensagem. */
export async function publishJob(channel: JobChannel, job: ProcessedJob) {
	const card = buildJobCard(job)

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
