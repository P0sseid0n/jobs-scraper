import { MessageFlags, Routes, type Client } from 'discord.js'
import { z } from 'zod'

import type { CvResult } from '@shared/contracts'
import { Job, saveCvFile } from '@shared/database'
import type { Logger } from '@shared/logging'
import { PermanentError } from '@shared/messaging'
import { loadCredentials, readSettings } from '@shared/settings'
import { formatApplicationBody, formatApplicationMessage, type TemplateMessage } from '@shared/templates'

import { isExpiredInteraction, toQueueError } from './discord-errors'
import { sendApplicationRow } from './mail-reply'
import { loadTemplateMessage, templateNotes } from './template-message'

/** Contexto que o bot manda no `replyTo` do pedido de currículo: a interação a responder (o token vale 15 min). */
export const DiscordReplyContextSchema = z.object({ applicationId: z.string().min(1), token: z.string().min(1) })

export type DiscordReplyContext = z.infer<typeof DiscordReplyContextSchema>

// Limite de caracteres de uma mensagem do Discord
const CONTENT_MAX = 2000

/**
 * Texto da resposta com o currículo: o aviso e, quando a IA escreveu, a mensagem de candidatura para copiar
 * (no lugar do modelo mostrado no clique). Sem ela, vale o modelo (`template`), e a resposta repete o aviso do que
 * faltou nele: sem fallback, o envio fica no site.
 */
export function buildCvDeliveryContent(
	result: Pick<CvResult, 'file' | 'jobTitle' | 'error' | 'message'>,
	signature = '',
	template: Pick<TemplateMessage, 'fallbacks' | 'missing'> | null = null,
) {
	if (!result.file) return `⚠️ Não consegui gerar o currículo: ${result.error ?? 'erro desconhecido'}`

	const header = `📄 Currículo ajustado para **${result.jobTitle ?? 'a vaga'}**`
	if (!result.message) {
		// O que usou o fallback já foi avisado no clique; o que faltou volta aqui, porque explica a falta do botão de envio
		return [header, ...(template?.missing.length ? templateNotes({ fallbacks: [], missing: template.missing }) : [])].join('\n')
	}

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
	// Sem a mensagem da IA (modo modelo, vaga sem e-mail, IA que falhou), o e-mail sugerido é o modelo preenchido
	const template = result.message ? null : await loadTemplateMessage(result.postId, result.jobTitle)
	const content = buildCvDeliveryContent(result, signature, template)
	const pdf = result.file ? Buffer.from(result.file.base64, 'base64') : null
	const files = result.file && pdf ? [{ name: result.file.name, data: pdf }] : undefined
	// Com variável sem valor e sem fallback, o texto precisa ser completado: o envio fica no site
	const sendable = result.file && pdf && !template?.missing.length
	const fileId = sendable ? await keepForMail(result, result.file!.name, pdf, signature, template) : null

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
 * Guarda o PDF e o e-mail sugerido (a mensagem da IA ou o modelo preenchido, com a assinatura) para o "Enviar
 * candidatura": o Discord não guarda o arquivo em outro lugar. `null` (sem botão) se a vaga não tem e-mail ou não há
 * conta de e-mail.
 */
async function keepForMail(result: CvResult, fileName: string, pdf: Buffer, signature: string, template: TemplateMessage | null) {
	const [job, account] = await Promise.all([
		Job.findOne({ postId: result.postId }, { recruiterEmail: 1 }).lean(),
		loadCredentials('smtp'),
	])
	if (!job?.recruiterEmail || !account) return null

	const message = result.message ?? template!
	const draft = {
		subject: message.subject,
		body: formatApplicationBody(message, signature),
		fallbacks: template?.fallbacks ?? [],
	}

	return saveCvFile({ postId: result.postId, fileName, pdf, draft })
}
