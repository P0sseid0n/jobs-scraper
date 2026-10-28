import { MailRequestSchema, type JobAppliedChange } from '@shared/contracts'
import { ApplicationMail, findCvFile, setJobApplied } from '@shared/database'
import { QUEUES } from '@shared/messaging'
import { startService } from '@shared/service'
import { loadCredentials } from '@shared/settings'

import { createSmtpTransport, senderOf, type MailTransport } from './mail-transport'
import { sendApplication, type MailRecords } from './send-application'

// A conta de e-mail fica nas credenciais (site ou `.env`) e o envio é registrado no banco
const { logger, queue } = await startService({ name: 'mailer', database: true })

await queue.assertQueue(QUEUES.webApplied)

/** O provedor da conta atual, reaproveitado enquanto ela não muda. */
let smtp: { key: string; transport: MailTransport } | null = null

/** Relê a conta de e-mail a cada envio: a salva pelo site vale sem reiniciar. Sem conta, o envio fica desligado. */
async function currentAccount() {
	const account = (await loadCredentials('smtp'))?.value
	if (!account) return null

	const key = JSON.stringify(account)
	if (smtp?.key !== key) smtp = { key, transport: createSmtpTransport(account) }

	return { transport: smtp.transport, from: senderOf(account) }
}

const records: MailRecords = {
	status: async mailId => (await ApplicationMail.findOne({ mailId }, { status: 1 }).lean())?.status ?? null,
	markSent: async (mailId, sentAt) => {
		await ApplicationMail.updateOne({ mailId }, { status: 'sent', error: null, sentAt, finishedAt: sentAt })
	},
	markFailed: async (mailId, error) => {
		await ApplicationMail.updateOne({ mailId }, { status: 'failed', error, finishedAt: new Date() })
	},
	noteRetry: async (mailId, error) => {
		await ApplicationMail.updateOne({ mailId }, { error, $inc: { retries: 1 } })
	},
}

await queue.consume(QUEUES.mailer, MailRequestSchema, (request, delivery) =>
	sendApplication(request, delivery, {
		account: currentAccount,
		records,
		findFile: async fileId => {
			const file = await findCvFile(fileId)
			return file ? { fileName: file.fileName, pdf: file.pdf } : null
		},
		reply: (replyQueue, result) => queue.publish(replyQueue, result),
		markApplied: async postId => {
			const result = await setJobApplied(postId, true)
			// O site atualiza os navegadores abertos, como na marcação pelo botão do Discord
			if (result?.changed) {
				const change: JobAppliedChange = { postId, appliedAt: result.appliedAt?.toISOString() ?? null }
				await queue.publish(QUEUES.webApplied, change)
			}
		},
		logger,
	}),
)
