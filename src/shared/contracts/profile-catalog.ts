/**
 * Sugestões para o perfil profissional: áreas comuns e cargos de cada uma, no idioma do sistema (`profile.areas` do
 * catálogo). São só sugestões: a área e o cargo-alvo aceitam qualquer texto.
 */
export type ProfileAreaSuggestion = { area: string; roles: readonly string[] }

/** Os cargos sugeridos para a área (a comparação ignora caixa, acentos e espaços nas pontas); área desconhecida → nenhum. */
export function suggestedRoles(areas: readonly ProfileAreaSuggestion[], area: string): readonly string[] {
	const key = comparable(area)
	return areas.find(suggestion => comparable(suggestion.area) === key)?.roles ?? []
}

function comparable(text: string) {
	return text
		.trim()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
}
