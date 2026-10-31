import { t } from '@shared/i18n'
import { formatApplicationMessage, type TemplateMessage } from '@shared/templates'

import { templateNotes } from './template-message'

/** Botão de contato/currículo: o custom_id carrega o postId para o cv-updater achar a vaga. */
export const CONTACT_BUTTON_PREFIX = 'contact:'

/** O aviso de que o currículo está sendo gerado e chega na mesma conversa. */
export const cvPendingNote = () => t().discord.cvPending

/** Lê o `custom_id` do botão: postId nos botões atuais, e-mail nos antigos (antes do cv-updater). */
export function parseContactButton(customId: string) {
	const value = customId.slice(CONTACT_BUTTON_PREFIX.length)

	return value.includes('@') ? { legacyEmail: value, postId: null } : { legacyEmail: null, postId: value }
}

/** Lê o e-mail do campo "📧 Contato" do card, ou `null` se não houver. */
export function emailFromEmbed(fields: { name: string; value: string }[]) {
	// Pelo emoji: o nome do campo muda com o idioma do sistema, e os cards antigos continuam valendo
	return fields.find(field => field.name.startsWith('📧'))?.value ?? null
}

/**
 * Monta a resposta ao botão de contato (só quem clicou vê): e-mail, a mensagem do modelo da pessoa (com os avisos do
 * que faltou na vaga) e o aviso do currículo.
 */
export function buildContactReply(email: string | null, message: TemplateMessage, opts: { generatingCv: boolean }) {
	if (!email) {
		return opts.generatingCv ? cvPendingNote() : t().discord.noEmail
	}

	return [
		t().discord.recruiterEmail(email),
		'',
		t().discord.copyMessage,
		'```',
		formatApplicationMessage(message).replaceAll('```', "'''"),
		'```',
		...templateNotes(message),
		...(opts.generatingCv ? ['', cvPendingNote()] : []),
	].join('\n')
}
