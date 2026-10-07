import {
	ChannelType,
	Client,
	DiscordAPIError,
	Events,
	type ForumChannel,
	GatewayIntentBits,
	MessageFlags,
	type SendableChannels,
} from 'discord.js'
import { discordEnv, loadConfig, rabbitmqEnv } from '../../config'
import { type ProcessedJob, ProcessedJobSchema } from '../../types/messages'
import { createLogger } from '../../utils/logger'
import { PermanentError, QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown } from '../../utils/shutdown'
import { buildContactReply, buildJobMessage, buildThreadName, CONTACT_BUTTON_PREFIX, pickForumTags } from './message'

const logger = createLogger('discord-bot')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...discordEnv })

// O bot só envia mensagens e responde a botões: não precisa de intents privilegiadas
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

/** Envia a vaga: num fórum, cada vaga vira um post próprio (com tags); num canal de texto, uma mensagem com embed. */
async function publishJob(channel: SendableChannels | ForumChannel, job: ProcessedJob) {
	const message = buildJobMessage(job)

	if (channel.type === ChannelType.GuildForum) {
		await channel.threads.create({
			name: buildThreadName(job),
			message,
			appliedTags: pickForumTags(job, channel.availableTags),
		})
		return
	}

	await channel.send(message)
}

/** Erros 4xx da API (exceto rate limit, que o discord.js já trata) não se resolvem tentando de novo. */
function toQueueError(error: unknown) {
	if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500 && error.status !== 429) {
		return new PermanentError(`Discord recusou a mensagem (${error.status} ${error.code}): ${error.message}`, { cause: error })
	}
	return error
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton() || !interaction.customId.startsWith(CONTACT_BUTTON_PREFIX)) return

	const email = interaction.customId.slice(CONTACT_BUTTON_PREFIX.length)
	const jobTitle = interaction.message.embeds[0]?.title ?? null

	try {
		await interaction.reply({ content: buildContactReply(email, jobTitle), flags: MessageFlags.Ephemeral })
	} catch (error) {
		logger.error({ err: error }, 'Erro ao responder o botão de contato')
	}
})

client.once(Events.ClientReady, async readyClient => {
	logger.info({ user: readyClient.user.tag }, 'Logado no Discord')

	const channel = await readyClient.channels.fetch(config.DISCORD_CHANNEL_ID).catch(() => null)
	const isForum = channel?.type === ChannelType.GuildForum
	if (!channel || (!isForum && !(channel.isTextBased() && channel.isSendable()))) {
		logger.fatal(
			{ channelId: config.DISCORD_CHANNEL_ID },
			'DISCORD_CHANNEL_ID inválido ou o canal não aceita mensagens (use um canal de texto ou de fórum)',
		)
		process.exit(1)
	}
	const target = channel as SendableChannels | ForumChannel
	logger.info(
		{ channelId: channel.id, forum: isForum },
		isForum ? 'Publicando vagas como posts do fórum' : 'Publicando vagas no canal',
	)

	const queue = new QueueClient({
		url: config.RABBITMQ_URL,
		maxRetries: config.QUEUE_MAX_RETRIES,
		retryDelayMs: config.QUEUE_RETRY_DELAY_MS,
		logger,
	})
	await queue.connect()
	onShutdown(() => queue.close())

	await queue.consume(QUEUES.discord, ProcessedJobSchema, async job => {
		try {
			await publishJob(target, job)
		} catch (error) {
			throw toQueueError(error)
		}
		logger.info({ postId: job.postId }, 'Vaga publicada no Discord')
	})
})

onShutdown(() => client.destroy())

await client.login(config.DISCORD_TOKEN).catch(error => {
	logger.fatal({ err: error }, 'Falha no login do Discord (verifique o DISCORD_TOKEN)')
	process.exit(1)
})
