/**
 * Sugestões para o perfil profissional: áreas comuns e cargos de cada uma. São só sugestões (a área e o cargo-alvo
 * aceitam qualquer texto); ficam aqui para o site, o onboarding e as sugestões de busca usarem a mesma lista.
 */
export const PROFILE_AREAS: Record<string, readonly string[]> = {
	Administração: ['Assistente Administrativo', 'Analista Administrativo', 'Auxiliar Administrativo', 'Secretária Executiva'],
	Atendimento: ['Atendente', 'Analista de Suporte ao Cliente', 'Operador de Telemarketing', 'Analista de Customer Success'],
	Contabilidade: ['Assistente Contábil', 'Analista Contábil', 'Analista Fiscal', 'Contador'],
	Design: ['Designer Gráfico', 'Designer UX/UI', 'Product Designer', 'Designer de Interiores'],
	'Desenvolvimento de software': [
		'Desenvolvedor Front-end',
		'Desenvolvedor Back-end',
		'Desenvolvedor Full Stack',
		'Desenvolvedor Mobile',
		'Engenheiro de Software',
	],
	Direito: ['Advogado', 'Assistente Jurídico', 'Analista Jurídico', 'Estagiário de Direito'],
	Educação: ['Professor', 'Coordenador Pedagógico', 'Auxiliar de Classe', 'Tutor'],
	Enfermagem: ['Enfermeiro', 'Técnico de Enfermagem', 'Auxiliar de Enfermagem', 'Enfermeiro do Trabalho'],
	Engenharia: ['Engenheiro Civil', 'Engenheiro de Produção', 'Engenheiro Mecânico', 'Engenheiro Eletricista'],
	Finanças: ['Analista Financeiro', 'Assistente Financeiro', 'Analista de Contas a Pagar', 'Controller'],
	Logística: ['Assistente de Logística', 'Analista de Logística', 'Auxiliar de Almoxarifado', 'Comprador'],
	Marketing: ['Analista de Marketing Digital', 'Social Media', 'Analista de SEO', 'Coordenador de Marketing'],
	'Recursos Humanos': ['Analista de RH', 'Assistente de Departamento Pessoal', 'Recrutador', 'Business Partner de RH'],
	Saúde: ['Fisioterapeuta', 'Nutricionista', 'Farmacêutico', 'Psicólogo'],
	Vendas: ['Vendedor', 'Representante Comercial', 'Executivo de Contas', 'SDR (Pré-vendas)'],
}

/** Os cargos sugeridos para a área (a comparação ignora caixa, acentos e espaços nas pontas); área desconhecida → nenhum. */
export function suggestedRoles(area: string): readonly string[] {
	const key = comparable(area)
	const match = Object.keys(PROFILE_AREAS).find(name => comparable(name) === key)

	return match ? PROFILE_AREAS[match]! : []
}

function comparable(text: string) {
	return text
		.trim()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
}
