/** Botão de contato/currículo: o custom_id carrega o postId para o cv-updater achar a vaga. */
export const CONTACT_BUTTON_PREFIX = 'contact:'

export const CV_PENDING_NOTE = '📄 Gerando seu currículo ajustado para esta vaga, ele chega aqui em alguns segundos...'

/** Botões antigos (antes do cv-updater) traziam o e-mail no custom_id em vez do postId. */
export function parseContactButton(customId: string) {
	const value = customId.slice(CONTACT_BUTTON_PREFIX.length)

	return value.includes('@') ? { legacyEmail: value, postId: null } : { legacyEmail: null, postId: value }
}

/** E-mail mostrado no card (campo "📧 Contato"), usado na resposta ao botão. */
export function emailFromEmbed(fields: { name: string; value: string }[]) {
	return fields.find(field => field.name === '📧 Contato')?.value ?? null
}

/** Texto da resposta (visível só para quem clicou) ao botão de contato. */
export function buildContactReply(email: string | null, jobTitle: string | null, opts: { generatingCv: boolean }) {
	if (!email) {
		return opts.generatingCv ? CV_PENDING_NOTE : 'Essa vaga não tem e-mail de contato.'
	}

	const role = jobTitle ?? 'a vaga'
	const template = [
		`Assunto: Candidatura – ${role}`,
		'',
		'Olá! Tudo bem?',
		'',
		`Vi a publicação sobre ${role} no LinkedIn e tenho interesse na oportunidade.`,
		'Envio em anexo meu currículo e fico à disposição para conversarmos.',
		'',
		'Obrigado!',
	]

	return [
		`📧 **E-mail do recrutador:** ${email}`,
		'',
		'Modelo de mensagem para copiar:',
		'```',
		...template,
		'```',
		...(opts.generatingCv ? ['', CV_PENDING_NOTE] : []),
	].join('\n')
}
