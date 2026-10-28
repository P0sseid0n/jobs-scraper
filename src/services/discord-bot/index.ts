import { CvResultSchema, JobPublishedSchema, MailResultSchema } from '@shared/contracts'
import { findJobImage } from '@shared/database'
import { onShutdown } from '@shared/lifecycle'
import { EXCHANGES, QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'

import { handleAppliedButton } from './applied-button'
import { handleContactButton } from './contact-button'
import { CONTACT_BUTTON_PREFIX } from './contact-reply'
import { deliverCv } from './cv-delivery'
import { DiscordConnection } from './discord-connection'
import { toQueueError } from './discord-errors'
import { APPLIED_BUTTON_PREFIX } from './job-card'
import { publishJob } from './job-publisher'
import { handleMailButton, handleMailCancel, handleMailSend } from './mail-button'
import { deliverMailResult } from './mail-delivery'
import { MAIL_BUTTON_PREFIX, MAIL_CANCEL_PREFIX, MAIL_SEND_PREFIX } from './mail-reply'

// O banco guarda o token e o canal salvos pelo site (sem eles, valem os do .env)
const { logger, queue } = await startService({ name: 'discord-bot', database: true })

const discord = new DiscordConnection({
	logger,
	onInteraction: async interaction => {
		if (!interaction.isButton()) return

		if (interaction.customId.startsWith(CONTACT_BUTTON_PREFIX)) {
			try {
				await handleContactButton(interaction, queue, logger)
			} catch (error) {
				logger.error({ err: error }, 'Erro ao responder o botão de contato')
			}
		} else if (interaction.customId.startsWith(APPLIED_BUTTON_PREFIX)) {
			try {
				await handleAppliedButton(interaction, queue, logger)
			} catch (error) {
				logger.error({ err: error }, 'Erro ao responder o botão de candidatura')
			}
		} else if (interaction.customId.startsWith(MAIL_BUTTON_PREFIX)) {
			try {
				await handleMailButton(interaction)
			} catch (error) {
				logger.error({ err: error }, 'Erro ao mostrar a confirmação do envio')
			}
		} else if (interaction.customId.startsWith(MAIL_SEND_PREFIX)) {
			try {
				await handleMailSend(interaction, queue, logger)
			} catch (error) {
				logger.error({ err: error }, 'Erro ao pedir o envio da candidatura')
			}
		} else if (interaction.customId.startsWith(MAIL_CANCEL_PREFIX)) {
			try {
				await handleMailCancel(interaction)
			} catch (error) {
				logger.error({ err: error }, 'Erro ao cancelar o envio da candidatura')
			}
		}
	},
})
onShutdown(() => discord.close())

await queue.assertQueue(QUEUES.cvUpdater)
await queue.assertQueue(QUEUES.webApplied)
await queue.assertQueue(QUEUES.mailer)
await discord.start()

// Os consumidores esperam o bot conectar (ou trocar de conta). Sem bot configurado, descartam as mensagens: senão
// todas as vagas se acumulariam na fila e seriam publicadas de uma vez quando alguém configurasse o Discord
await queue.consume(QUEUES.discordCv, CvResultSchema, async result => {
	const link = await discord.ready()
	if (!link) {
		logger.warn({ postId: result.postId }, 'Currículo descartado: nenhum bot do Discord configurado para entregá-lo')
		return
	}

	await deliverCv(link.client, result, logger)
})

await queue.consume(QUEUES.discordMail, MailResultSchema, async result => {
	const link = await discord.ready()
	if (!link) {
		logger.warn({ mailId: result.mailId }, 'Resultado de envio descartado: nenhum bot do Discord configurado (ele fica no site)')
		return
	}

	await deliverMailResult(link.client, result, logger)
})

// A fila `discord` assina o evento `job-published`: recebe todas as vagas, independente de outros canais
await queue.consume(
	QUEUES.discord,
	JobPublishedSchema,
	async job => {
		const link = await discord.ready()
		if (!link) {
			logger.info({ postId: job.postId }, 'Vaga não publicada no Discord: nenhum bot configurado (ela fica no site)')
			return
		}

		// Só a primeira imagem do post: o embed mostra uma
		const image = job.imageCount > 0 ? await findJobImage(job.postId, 0) : null

		try {
			await publishJob(link.channel, job, image && { mimeType: image.mimeType, data: image.data })
		} catch (error) {
			throw toQueueError(error)
		}

		logger.info({ postId: job.postId }, 'Vaga publicada no Discord')
	},
	{ bindTo: EXCHANGES.jobPublished },
)
