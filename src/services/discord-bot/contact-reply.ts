import { applicationMessage } from '@shared/templates'

/** Botão de contato/currículo: o custom_id carrega o postId para o cv-updater achar a vaga. */
export const CONTACT_BUTTON_PREFIX = 'contact:'

export const CV_PENDING_NOTE = '📄 Gerando seu currículo ajustado para esta vaga, ele chega aqui em alguns segundos...'

/** Lê o `custom_id` do botão: postId nos botões atuais, e-mail nos antigos (antes do cv-updater). */
export function parseContactButton(customId: string) {
	const value = customId.slice(CONTACT_BUTTON_PREFIX.length)

	return value.includes('@') ? { legacyEmail: value, postId: null } : { legacyEmail: null, postId: value }
}

/** Lê o e-mail do campo "📧 Contato" do card, ou `null` se não houver. */
export function emailFromEmbed(fields: { name: string; value: string }[]) {
	return fields.find(field => field.name === '📧 Contato')?.value ?? null
}

/** Monta a resposta ao botão de contato (só quem clicou vê): e-mail, modelo de mensagem e aviso do currículo. */
export function buildContactReply(email: string | null, jobTitle: string | null, opts: { generatingCv: boolean }) {
	if (!email) {
		return opts.generatingCv ? CV_PENDING_NOTE : 'Essa vaga não tem e-mail de contato.'
	}

	return [
		`📧 **E-mail do recrutador:** ${email}`,
		'',
		'Modelo de mensagem para copiar:',
		'```',
		applicationMessage(jobTitle),
		'```',
		...(opts.generatingCv ? ['', CV_PENDING_NOTE] : []),
	].join('\n')
}
