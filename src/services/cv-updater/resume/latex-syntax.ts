/**
 * Leitura e reescrita do currículo em LaTeX. O `.tex` do usuário é a fonte da verdade: só os trechos de texto
 * das seções abaixo são reescritos (apresentação, ordem/destaque de habilidades, ordem de projetos e de bullets).
 * Preâmbulo, cabeçalho, espaçamentos e todo o resto ficam byte a byte iguais, então o design não muda.
 *
 * Formato esperado de cada seção (o mesmo do currículo base):
 * - Apresentação: um parágrafo de texto.
 * - Habilidades Técnicas: itemize com linhas `\item \textbf{Categoria:} item, item, item`.
 * - Projetos: blocos começando com `\textbf{Nome}`, separados por `\vspace{...}`; tecnologias em `\textit{Tecnologias: ...}`.
 * - Experiência Profissional: cabeçalho de cada empresa seguido de um itemize com os bullets.
 * Seções ausentes ou fora desse formato são mantidas como estão.
 */

export const SECTION_TITLES = {
	summary: 'Apresentação',
	skills: 'Habilidades Técnicas',
	projects: 'Projetos',
	experience: 'Experiência Profissional',
} as const

/** Remove os comandos LaTeX mais comuns, deixando só o texto. */
export function latexToPlainText(latex: string) {
	return latex
		.replace(/(?<!\\)%.*$/gm, '')
		.replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
		.replace(/\\(?:textbf|textit|emph|underline|texttt|mbox)\{([^}]*)\}/g, '$1')
		.replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, ' ')
		.replace(/\\(?:hfill|newline|noindent|centering|par)\b/g, ' ')
		.replace(/\\\\/g, ' ')
		.replace(/\\([&%$#_{}])/g, '$1')
		.replace(/~/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

export function escapeLatex(text: string) {
	return text
		.replace(/\\/g, '\\textbackslash{}')
		.replace(/([&%$#_{}])/g, '\\$1')
		.replace(/~/g, '\\textasciitilde{}')
		.replace(/\^/g, '\\textasciicircum{}')
}

/** Divide "a, b (c, d), e" nas vírgulas de nível superior (fora de parênteses e chaves). */
export function splitTopLevel(text: string) {
	const parts: string[] = []
	let depth = 0
	let current = ''
	for (const char of text) {
		if (char === '(' || char === '{') depth++
		if (char === ')' || char === '}') depth--
		if (char === ',' && depth === 0) {
			parts.push(current)
			current = ''
		} else current += char
	}
	parts.push(current)
	return parts.map(part => part.trim()).filter(Boolean)
}

/** Separa o corpo de uma seção em espaço inicial, conteúdo e espaço final (preservados na remontagem). */
export function splitWhitespace(body: string) {
	const lead = body.match(/^\s*/)![0]
	const trail = body.slice(lead.length).match(/\s*$/)![0]
	return { lead, content: body.slice(lead.length, body.length - trail.length), trail }
}

export const SKILL_LINE = /^(\s*\\item\s+\\textbf\{)(.+?):\}(\s*)(.+?)\s*$/

/**
 * Separa os blocos de projeto. O separador inclui as linhas em branco ao redor do `\vspace`: sem elas o LaTeX
 * junta o projeto seguinte ao parágrafo anterior.
 */
export function splitProjectBlocks(content: string) {
	const separator = content.match(/\s*\n[ \t]*\\vspace\*?\{[^}]*\}[ \t]*\n\s*/)?.[0]
	return { blocks: separator ? content.split(separator) : [content], separator: separator ?? '\n\n' }
}

export const ITEMIZE = /\\begin\{itemize\}(\[[^\]]*\])?([\s\S]*?)\\end\{itemize\}/g

export function splitItems(inner: string) {
	const parts = inner.split(/(?=\\item\b)/)
	return { before: parts[0]!, items: parts.slice(1) }
}
