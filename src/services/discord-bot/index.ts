import { ButtonStyle, Client, ComponentType, Events, GatewayIntentBits, MessagePayload } from 'discord.js'
import { discordEnv, loadConfig, rabbitmqEnv } from '../../config'
import { ProcessedJobSchema } from '../../types/messages'
import { createLogger } from '../../utils/logger'
import { QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown } from '../../utils/shutdown'

const logger = createLogger('discord-bot')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...discordEnv })

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

function truncate(str: string, max: number) {
	return str.length > max ? `${str.slice(0, max - 3)}...` : str
}

client.once(Events.ClientReady, async readyClient => {
	logger.info({ user: readyClient.user.tag }, 'Logado no Discord')

	const discordChannel = await readyClient.channels.fetch(config.DISCORD_CHANNEL_ID).catch(() => null)
	if (!discordChannel?.isTextBased() || !discordChannel.isSendable()) {
		logger.fatal({ channelId: config.DISCORD_CHANNEL_ID }, 'DISCORD_CHANNEL_ID inválido ou o canal não aceita mensagens')
		process.exit(1)
	}

	const queue = new QueueClient({
		url: config.RABBITMQ_URL,
		maxRetries: config.QUEUE_MAX_RETRIES,
		retryDelayMs: config.QUEUE_RETRY_DELAY_MS,
		logger,
	})
	await queue.connect()
	onShutdown(() => queue.close())

	await queue.consume(QUEUES.discord, ProcessedJobSchema, async data => {
		const headerContent = `✨ **Nova vaga encontrada!** ✨ *${data.aiJobConfidence}%*` + `\n> ${data.title || 'Sem título'}`
		const footerContent =
			`Empresa: \`${data.company || 'Sem empresa'}\`` +
			`\nLocalização: \`${data.location || 'Sem localização'}\`` +
			`\nModalidade: \`${data.workMode || 'Não informada'}\`` +
			`\nPublicada em: \`${data.postedAt ? new Date(data.postedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data desconhecida'}\`` +
			`\nConhecimentos Necessários: \`${data.necessary_knowledge?.join(', ') || 'Sem conhecimentos necessários'}\`` +
			`\nLink: \`${data.link || 'Sem link'}\``

		const MAX_CONTENT_LENGTH = 2000
		const availableForRaw = MAX_CONTENT_LENGTH - (headerContent.length + footerContent.length) - 50

		const bodyContent = `\n\`\`\`${truncate(data.rawContent, availableForRaw)}\`\`\``

		const message = new MessagePayload(discordChannel, {
			content: headerContent + bodyContent + footerContent,
			components: data.recruiter_email
				? [
						{
							type: ComponentType.ActionRow,
							components: [
								{
									type: ComponentType.Button,
									style: ButtonStyle.Primary,
									label: '📧 Enviar Email',
									custom_id: 'send_email',
								},
							],
						},
					]
				: [],
		})

		await discordChannel.send(message)
		logger.info({ postId: data.postId }, 'Vaga publicada no Discord')
	})
})

onShutdown(() => client.destroy())

await client.login(config.DISCORD_TOKEN).catch(error => {
	logger.fatal({ err: error }, 'Falha no login do Discord (verifique o DISCORD_TOKEN)')
	process.exit(1)
})
