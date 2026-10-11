/** Modelo de mensagem de candidatura por e-mail, oferecido para copiar nos canais (Discord, site). */
export function applicationMessage(jobTitle: string | null) {
	const role = jobTitle ?? 'a vaga'

	return [
		`Assunto: Candidatura – ${role}`,
		'',
		'Olá! Tudo bem?',
		'',
		`Vi a publicação sobre ${role} no LinkedIn e tenho interesse na oportunidade.`,
		'Envio em anexo meu currículo e fico à disposição para conversarmos.',
		'',
		'Obrigado!',
	].join('\n')
}
