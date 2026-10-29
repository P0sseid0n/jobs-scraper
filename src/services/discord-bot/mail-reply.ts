import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	time,
	TimestampStyles,
	type APIActionRowComponent,
	type APIComponentInMessageActionRow,
	type MessageActionRowComponentBuilder,
} from 'discord.js'

import type { MailResult } from '@shared/contracts'

import { templateNotes } from './template-message'

/** "Enviar candidatura": abre a confirmação. O custom_id carrega o `fileId` do currículo guardado (coleção `cv_files`). */
export const MAIL_BUTTON_PREFIX = 'mail:'
/** "Confirmar envio", na confirmação: só ele envia. */
export const MAIL_SEND_PREFIX = 'mail-send:'
export const MAIL_CANCEL_PREFIX = 'mail-cancel:'

// Limite de caracteres de uma mensagem do Discord, com folga para o resto da confirmação
const CONTENT_MAX = 2000
const BODY_PREVIEW_MAX = 1300

type Row = APIActionRowComponent<APIComponentInMessageActionRow>

function row(...buttons: ButtonBuilder[]): Row {
	return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(buttons).toJSON()
}

/** O botão "Enviar candidatura" (ou "Tentar de novo", depois de uma falha) para o currículo guardado. */
export function sendApplicationRow(fileId: string, retry = false) {
	return row(
		new ButtonBuilder()
			.setCustomId(`${MAIL_BUTTON_PREFIX}${fileId}`)
			.setStyle(retry ? ButtonStyle.Secondary : ButtonStyle.Primary)
			.setLabel(retry ? 'Tentar de novo' : 'Enviar candidatura')
			.setEmoji(retry ? '🔁' : '✉️'),
	)
}

/** Os botões da confirmação: só "Confirmar envio" manda o e-mail. */
export function confirmationRow(fileId: string, resend: boolean) {
	return row(
		new ButtonBuilder()
			.setCustomId(`${MAIL_SEND_PREFIX}${fileId}`)
			.setStyle(ButtonStyle.Success)
			.setLabel(resend ? 'Enviar de novo' : 'Confirmar envio')
			.setEmoji('📤'),
		new ButtonBuilder().setCustomId(`${MAIL_CANCEL_PREFIX}${fileId}`).setStyle(ButtonStyle.Secondary).setLabel('Cancelar'),
	)
}

/**
 * A confirmação do envio (só quem clicou vê): para quem, o assunto, o corpo e o anexo, como vão no e-mail, e o aviso
 * quando a vaga já recebeu candidatura. Corpo longo demais para o Discord aparece cortado (o e-mail leva inteiro).
 * `fallbacks`: as variáveis do modelo que a vaga não tinha e usaram o fallback, avisadas antes de confirmar.
 */
export function buildMailConfirmation(mail: {
	to: string
	subject: string
	body: string
	fileName: string
	lastSentAt: Date | null
	fallbacks?: string[]
}) {
	// Três crases no texto fechariam o bloco de código antes da hora
	const body = mail.body.replaceAll('```', "'''")
	const cut = body.length > BODY_PREVIEW_MAX
	const warning = mail.lastSentAt
		? [
				`⚠️ **Esta vaga já recebeu sua candidatura por e-mail** ${time(mail.lastSentAt, TimestampStyles.RelativeTime)}. Confirmar manda outro e-mail.`,
				'',
			]
		: []

	const content = [
		...warning,
		'**Revise a candidatura antes de enviar:**',
		`📧 **Para:** ${mail.to}`,
		`📝 **Assunto:** ${mail.subject}`,
		'```',
		cut ? `${body.slice(0, BODY_PREVIEW_MAX).trimEnd()}\n[…]` : body,
		'```',
		`📎 ${mail.fileName}${cut ? ' · o texto completo vai no e-mail' : ''}`,
		...templateNotes({ fallbacks: mail.fallbacks ?? [], missing: [] }),
		'',
		'Nada é enviado sem o “Confirmar envio”. Para mudar o texto, use o site.',
	].join('\n')

	return content.slice(0, CONTENT_MAX)
}

/** O texto da confirmação depois do resultado do mailer. */
export function mailResultContent(result: Pick<MailResult, 'status' | 'error'>, to: string) {
	return result.status === 'sent'
		? `✅ Candidatura enviada para **${to}**, com o currículo anexado. A vaga ficou marcada como candidatura enviada.`
		: `⚠️ O envio para **${to}** falhou: ${result.error ?? 'erro desconhecido'}`
}
