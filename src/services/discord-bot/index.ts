import { Client, Events, GatewayIntentBits } from 'discord.js'

import { CvResultSchema, ProcessedJobSchema } from '@shared/contracts'
import { onShutdown } from '@shared/lifecycle'
import { EXCHANGES, QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'

import { discordEnv } from './config'
import { handleContactButton } from './contact-button'
import { CONTACT_BUTTON_PREFIX } from './contact-reply'
import { deliverCv } from './cv-delivery'
import { toQueueError } from './discord-errors'
import { publishJob, resolveJobChannel } from './job-publisher'

const { config, logger, queue } = await startService({ name: 'discord-bot', env: discordEnv })

const client = new Client({ intents: [GatewayIntentBits.Guilds] })
onShutdown(() => client.destroy())

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton() || !interaction.customId.startsWith(CONTACT_BUTTON_PREFIX)) return

	try {
		await handleContactButton(interaction, queue, logger)
	} catch (error) {
		logger.error({ err: error }, 'Erro ao responder o botão de contato')
	}
})

// As filas só começam a ser consumidas quando o canal do Discord está disponível
client.once(Events.ClientReady, async readyClient => {
	logger.info({ user: readyClient.user.tag }, 'Logado no Discord')

	const channel = await resolveJobChannel(readyClient, config.DISCORD_CHANNEL_ID, logger)
	await queue.assertQueue(QUEUES.cvUpdater)

	await queue.consume(QUEUES.discordCv, CvResultSchema, result => deliverCv(client, result, logger))

	// A fila `discord` assina o evento `job-published`: recebe todas as vagas, independente de outros canais
	await queue.consume(
		QUEUES.discord,
		ProcessedJobSchema,
		async job => {
			try {
				await publishJob(channel, job)
			} catch (error) {
				throw toQueueError(error)
			}

			logger.info({ postId: job.postId }, 'Vaga publicada no Discord')
		},
		{ bindTo: EXCHANGES.jobPublished },
	)
})

await client.login(config.DISCORD_TOKEN).catch(error => {
	logger.fatal({ err: error }, 'Falha no login do Discord (verifique o DISCORD_TOKEN)')
	process.exit(1)
})
