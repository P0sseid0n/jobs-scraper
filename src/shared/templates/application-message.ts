/** E-mail de candidatura: o assunto e o corpo (o mesmo formato do `ApplicationMessage` dos contratos). */
export type ApplicationMessageText = { subject: string; body: string }

/** Modelo padrão de e-mail de candidatura, usado quando não há mensagem gerada pela IA para a vaga. */
export function defaultApplicationMessage(jobTitle: string | null): ApplicationMessageText {
	const role = jobTitle ?? 'a vaga'

	return {
		subject: `Candidatura – ${role}`,
		body: [
			'Olá! Tudo bem?',
			'',
			`Vi a publicação sobre ${role} no LinkedIn e tenho interesse na oportunidade.`,
			'Envio em anexo meu currículo e fico à disposição para conversarmos.',
			'',
			'Obrigado!',
		].join('\n'),
	}
}

/**
 * O e-mail como texto para copiar: "Assunto: …", uma linha em branco, o corpo e, se houver, a assinatura das
 * configurações (colada como está: ela nunca passa pela IA, que poderia estragar os links).
 */
export function formatApplicationMessage(message: ApplicationMessageText, signature = '') {
	const footer = signature.trim()
	return `Assunto: ${message.subject}\n\n${message.body}${footer ? `\n\n${footer}` : ''}`
}

/** Modelo de mensagem de candidatura por e-mail, oferecido para copiar nos canais (Discord, site). */
export function applicationMessage(jobTitle: string | null, signature = '') {
	return formatApplicationMessage(defaultApplicationMessage(jobTitle), signature)
}
