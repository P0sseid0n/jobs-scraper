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
 * O corpo do e-mail para copiar: o texto e, se houver, a assinatura das configurações depois de uma linha em branco
 * (colada como está: ela nunca passa pela IA, que poderia estragar os links).
 */
export function formatApplicationBody(message: ApplicationMessageText, signature = '') {
	const footer = signature.trim()
	return `${message.body}${footer ? `\n\n${footer}` : ''}`
}

/** O e-mail como um texto só, para onde não dá para copiar em partes (Discord): "Assunto: …", uma linha em branco e o corpo. */
export function formatApplicationMessage(message: ApplicationMessageText, signature = '') {
	return `Assunto: ${message.subject}\n\n${formatApplicationBody(message, signature)}`
}

/** Modelo de mensagem de candidatura por e-mail, oferecido para copiar no Discord. */
export function applicationMessage(jobTitle: string | null, signature = '') {
	return formatApplicationMessage(defaultApplicationMessage(jobTitle), signature)
}
