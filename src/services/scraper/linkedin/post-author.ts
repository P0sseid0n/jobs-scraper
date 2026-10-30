/** O grau de conexão ao lado do nome: "• 2º", "• 3º e +", "• 1st". */
const CONNECTION_DEGREE = /^•?\s*(\d+º( e \+)?|1st|2nd|3rd\+?)$/i

/** A data do post ("há 22 min", "1 d • Editado", "3 sem"), que vem embaixo do subtítulo. */
const POST_TIME = /^(há\s+)?\d+\s*(s|min|h|d|sem|m|mês|meses|a|ano|anos|w|mo|yr|y)\b/i

/** O que o LinkedIn escreve no lugar do subtítulo: seguidores de uma página, post promovido, selo de verificação. */
const NOT_A_HEADLINE = /^(•|promovido|promoted|patrocinado|sponsored|verificad[oa]|verified)|\b(seguidores|followers)\b/i

const MAX_HEADLINE_LENGTH = 300

/**
 * O subtítulo do perfil de quem postou ("Responsável por Sistemas no Grupo ABC | MBA em Gestão de TI"), nas linhas do
 * cabeçalho do card: o nome, o grau de conexão, o subtítulo e a data do post. Sem classes estáveis no HTML, é a primeira
 * linha que não é nenhuma das outras.
 * @param lines O texto do cabeçalho do card, linha a linha.
 * @param author O nome do autor, que se repete nas linhas.
 * @returns O subtítulo, ou `null` se o card não tem um (a página de uma empresa mostra os seguidores no lugar).
 */
export function authorHeadline(lines: string[], author: string | null): string | null {
	const headline = lines
		.map(line => line.replace(/\s+/g, ' ').trim())
		.find(
			line =>
				/\p{L}.*\p{L}/u.test(line) &&
				line !== author?.trim() &&
				!CONNECTION_DEGREE.test(line) &&
				!POST_TIME.test(line) &&
				!NOT_A_HEADLINE.test(line),
		)

	return headline && headline.length <= MAX_HEADLINE_LENGTH ? headline : null
}
