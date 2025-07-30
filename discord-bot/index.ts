import { ButtonStyle, Client, ComponentType, Events, GatewayIntentBits, MessagePayload } from 'discord.js'
import ampqlib from 'amqplib'

import AiJsonResponse from '../types/AiJsonResponse'

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

function truncate(str: string, max: number) {
	return str.length > max ? str.slice(0, max - 3) + '...' : str
}

client.once(Events.ClientReady, async readyClient => {
	console.log(`Logged in as ${readyClient.user?.tag}!`)

	const connection = await ampqlib.connect('amqp://user:user@localhost')
	const channel = await connection.createChannel()

	const queue = 'send-discord-message'
	await channel.assertQueue(queue)
	await channel.prefetch(1)

	console.log('Waiting for messages in queue:', queue)
	channel.consume(queue, async msg => {
		if (!msg) return
		console.log(`${queue} - Received message with timestamp:`, msg.properties.timestamp)

		const content = msg.content.toString()

		let data: AiJsonResponse | null = null
		try {
			data = JSON.parse(content)
		} catch (error) {
			console.error('Error parsing JSON:', error)
			return channel.ack(msg)
		}

		const channelId = process.env.DISCORD_CHANNEL_ID
		if (!channelId) {
			console.error('DISCORD_CHANNEL_ID is not set in the environment variables.')
			return
		}

		const discordChannel = readyClient.channels.cache.get(channelId)
		if (!discordChannel || !discordChannel.isTextBased() || !discordChannel.isSendable()) {
			console.error('Invalid channel ID or channel is not text-based.')
			return
		}

		const headerContent = `✨ **Nova vaga encontrada!** ✨ *${data?.aiJobConfidence}%*` + `\n> ${data?.title || 'Sem título'}`
		const footerContent =
			`Empresa: \`${data?.company || 'Sem empresa'}\`` +
			`\nLocalização: \`${data?.location || 'Sem localização'}\`` +
			`\nConhecimentos Necessários: \`${data?.necessary_knowledge?.join(', ') || 'Sem conhecimentos necessários'}\`` +
			`\nLink: \`${data?.link || 'Sem link'}\``

		const MAX_CONTENT_LENGTH = 2000
		const availableForRaw = MAX_CONTENT_LENGTH - (headerContent.length + footerContent.length) - 50

		const bodyContent = `\n\`\`\`${truncate(data?.rawContent || '', availableForRaw)}\`\`\``

		const message = new MessagePayload(discordChannel, {
			content: headerContent + bodyContent + footerContent,
			components: data?.recruiter_email
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

		try {
			console.log('Sending message to Discord channel:', message.body)
			await discordChannel.send(message)
			channel.ack(msg)
		} catch (error) {
			console.error('Error sending message to Discord channel:', error)
			channel.nack(msg, false, true)
		}
	})
})

client.login(process.env.DISCORD_TOKEN)
