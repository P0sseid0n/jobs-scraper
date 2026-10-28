import { MessageFlags, Routes, type Client } from 'discord.js'
import { z } from 'zod'

import type { CvResult } from '@shared/contracts'
import { Job, saveCvFile } from '@shared/database'
import type { Logger } from '@shared/logging'
import { PermanentError } from '@shared/messaging'
import { loadCredentials, readSettings } from '@shared/settings'
import { defaultApplicationMessage, formatApplicationBody, formatApplicationMessage } from '@shared/templates'

import { isExpiredInteraction, toQueueError } from './discord-errors'
import { sendApplicationRow } from './mail-reply'

/** Contexto que o bot manda no `replyTo` do pedido de currículo: a interação a responder (o token vale 15 min). */
export const DiscordReplyContextSchema = z.object({ applicationId: z.string().min(1), token: z.string().min(1) })

export type DiscordReplyContext = z.infer<typeof DiscordReplyContextSchema>

// Limite de caracteres de uma mensagem do Discord
const CONTENT_MAX = 2000

/**
 * Texto da resposta com o currículo: o aviso e, quando a IA escreveu, a mensagem de candidatura para copiar
 * (no lugar do modelo padrão mostrado no clique).
 */
export function buildCvDeliveryContent(result: Pick<CvResult, 'file' | 'jobTitle' | 'error' | 'message'>, signature = '') {
	if (!result.file) return `⚠️ Não consegui gerar o currículo: ${result.error ?? 'erro desconhecido'}`

	const header = `📄 Currículo ajustado para **${result.jobTitle ?? 'a vaga'}**`
	if (!result.message) return header

	// Três crases no texto fechariam o bloco de código antes da hora
	const message = formatApplicationMessage(result.message, signature).replaceAll('```', "'''")
	const content = `${header}\n\n✉️ Mensagem escrita para esta vaga (revise antes de enviar):\n\`\`\`\n${message}\n\`\`\``

	return content.length <= CONTENT_MAX ? content : header
}

/**
 * Entrega o currículo como resposta extra ao clique (só quem clicou vê); o token da interação vale 15 min. Com e-mail
 * de contato e conta de e-mail configurada, vem com o botão "Enviar candidatura" (que pede confirmação).
 */
export async function deliverCv(client: Client, result: CvResult, logger: Logger) {
	const context = DiscordReplyContextSchema.safeParse(result.context)
	if (!context.success) throw new PermanentError('Resultado de currículo sem a interação do Discord no contexto')

	const { signature } = await readSettings('message')
	const content = buildCvDeliveryContent(result, signature)
	const pdf = result.file ? Buffer.from(result.file.base64, 'base64') : null
	const files = result.file && pdf ? [{ name: result.file.name, data: pdf }] : undefined
	const fileId = result.file && pdf ? await keepForMail(result, result.file.name, pdf, signature) : null

	try {
		await client.rest.post(Routes.webhook(context.data.applicationId, context.data.token), {
			auth: false,
			body: { content, flags: MessageFlags.Ephemeral, components: fileId ? [sendApplicationRow(fileId)] : [] },
			files,
		})
	} catch (error) {
		// Interação expirada ou inválida: não adianta tentar de novo
		if (isExpiredInteraction(error)) {
			logger.warn({ postId: result.postId }, 'Interação expirada; currículo não entregue (o PDF fica salvo em data/cv/generated/)')
			return
		}

		throw toQueueError(error)
	}

	logger.info({ postId: result.postId }, result.file ? 'Currículo entregue no Discord' : 'Falha na geração avisada no Discord')
}

/**
 * Guarda o PDF e o e-mail sugerido (a mensagem da IA ou o modelo, com a assinatura) para o "Enviar candidatura": o
 * Discord não guarda o arquivo em outro lugar. `null` (sem botão) se a vaga não tem e-mail ou não há conta de e-mail.
 */
async function keepForMail(result: CvResult, fileName: string, pdf: Buffer, signature: string) {
	const [job, account] = await Promise.all([
		Job.findOne({ postId: result.postId }, { recruiterEmail: 1 }).lean(),
		loadCredentials('smtp'),
	])
	if (!job?.recruiterEmail || !account) return null

	const message = result.message ?? defaultApplicationMessage(result.jobTitle)
	const draft = { subject: message.subject, body: formatApplicationBody(message, signature) }

	return saveCvFile({ postId: result.postId, fileName, pdf, draft })
}
