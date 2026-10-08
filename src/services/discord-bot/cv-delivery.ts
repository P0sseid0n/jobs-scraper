import { MessageFlags, Routes, type Client } from 'discord.js'

import type { CvResult } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import { isExpiredInteraction, toQueueError } from './discord-errors'

/** Entrega o currículo como resposta extra ao clique (só quem clicou vê); o token da interação vale 15 min. */
export async function deliverCv(client: Client, result: CvResult, logger: Logger) {
	const content = result.file
		? `📄 Currículo ajustado para **${result.jobTitle ?? 'a vaga'}**`
		: `⚠️ Não consegui gerar o currículo: ${result.error ?? 'erro desconhecido'}`

	const files = result.file ? [{ name: result.file.name, data: Buffer.from(result.file.base64, 'base64') }] : undefined

	try {
		await client.rest.post(Routes.webhook(result.interaction.applicationId, result.interaction.token), {
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
