import { MessageFlags, Routes, type Client } from 'discord.js'
import { z } from 'zod'

import type { CvResult } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { PermanentError } from '@shared/messaging'
import { readSettings } from '@shared/settings'
import { formatApplicationMessage } from '@shared/templates'

import { isExpiredInteraction, toQueueError } from './discord-errors'

/** Contexto que o bot manda no `replyTo` do pedido de currículo: a interação a responder (o token vale 15 min). */
const DiscordReplyContextSchema = z.object({ applicationId: z.string().min(1), token: z.string().min(1) })

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

/** Entrega o currículo como resposta extra ao clique (só quem clicou vê); o token da interação vale 15 min. */
export async function deliverCv(client: Client, result: CvResult, logger: Logger) {
	const context = DiscordReplyContextSchema.safeParse(result.context)
	if (!context.success) throw new PermanentError('Resultado de currículo sem a interação do Discord no contexto')

	const { signature } = await readSettings('message')
	const content = buildCvDeliveryContent(result, signature)
	const files = result.file ? [{ name: result.file.name, data: Buffer.from(result.file.base64, 'base64') }] : undefined

	try {
		await client.rest.post(Routes.webhook(context.data.applicationId, context.data.token), {
			auth: false,
			body: { content, flags: MessageFlags.Ephemeral },
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
