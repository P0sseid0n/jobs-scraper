/**
 * Leitura e reescrita do currículo em LaTeX. O `.tex` do usuário é a fonte da verdade: só os trechos de texto
 * das seções abaixo são reescritos (apresentação, ordem/destaque de habilidades, ordem de projetos e de bullets).
 * Preâmbulo, cabeçalho, espaçamentos e todo o resto ficam byte a byte iguais, então o design não muda.
 *
 * Formato esperado de cada seção (o mesmo do currículo base):
 * - Apresentação: um parágrafo de texto.
 * - Habilidades: itemize com linhas `\item \textbf{Categoria:} item, item, item`.
 * - Projetos (opcional): blocos começando com `\textbf{Nome}`, separados por `\vspace{...}`; tecnologias em
 *   `\textit{Tecnologias: ...}` (ou `Ferramentas:`, `Competências:`, ver PROJECT_SKILLS_LABEL).
 * - Experiência: cabeçalho de cada empresa seguido de um itemize com os bullets.
 * Formação, certificações e idiomas não são reescritos: a IA só os lê. Seções ausentes, com outro título ou fora
 * desse formato são mantidas como estão.
 */

/** Título de cada seção no modelo, usado nas mensagens; o `.tex` pode usar qualquer um de SECTION_ALIASES. */
export const SECTION_TITLES = {
	summary: 'Apresentação',
	skills: 'Habilidades Técnicas',
	projects: 'Projetos',
	experience: 'Experiência Profissional',
	education: 'Formação',
	certifications: 'Certificações e Cursos',
	languages: 'Idiomas',
} as const

export type SectionKey = keyof typeof SECTION_TITLES

/** Seções que o ajuste reescreve; as demais só entram no texto que a IA lê. */
export const EDITABLE_SECTIONS = ['summary', 'skills', 'projects', 'experience'] as const satisfies readonly SectionKey[]

export type EditableSection = (typeof EDITABLE_SECTIONS)[number]

/**
 * Títulos aceitos para cada seção, em português e em inglês, comparados sem acentos nem maiúsculas.
 * Um título composto ("Certificações/Cursos", "Cursos e Certificações") vale se todas as partes forem da mesma seção.
 */
const SECTION_ALIASES: Record<SectionKey, string[]> = {
	summary: [
		'apresentação',
		'resumo',
		'resumo profissional',
		'sobre',
		'sobre mim',
		'perfil',
		'perfil profissional',
		'objetivo',
		'objetivo profissional',
		'summary',
		'professional summary',
		'about',
		'about me',
		'profile',
		'professional profile',
		'objective',
	],
	skills: [
		'habilidades',
		'habilidades técnicas',
		'competências',
		'competências técnicas',
		'conhecimentos',
		'conhecimentos técnicos',
		'skills',
		'technical skills',
		'competencies',
	],
	projects: ['projetos', 'projetos pessoais', 'portfólio', 'projects', 'personal projects', 'portfolio'],
	experience: [
		'experiência',
		'experiências',
		'experiência profissional',
		'experiências profissionais',
		'histórico profissional',
		'experience',
		'professional experience',
		'work experience',
		'employment history',
	],
	education: ['formação', 'formação acadêmica', 'escolaridade', 'education', 'academic background'],
	certifications: [
		'certificações',
		'certificados',
		'cursos',
		'cursos complementares',
		'certifications',
		'certificates',
		'courses',
		'licenses',
	],
	languages: ['idiomas', 'línguas', 'languages'],
}

/** O argumento de um comando, aceitando dentro dele `{}` vazias (`\textquotedbl{}`) e chaves escapadas. */
const BRACED_ARGUMENT = String.raw`\{((?:[^{}]|\{\}|\\[{}])*)\}`
const HREF = new RegExp(String.raw`\\href\{[^}]*\}${BRACED_ARGUMENT}`, 'g')
const TEXT_STYLE = new RegExp(String.raw`\\(?:textbf|textit|emph|underline|texttt|mbox)${BRACED_ARGUMENT}`, 'g')

const LATEX_ESCAPES: Record<string, string> = {
	'\\': '\\textbackslash{}',
	'~': '\\textasciitilde{}',
	'^': '\\textasciicircum{}',
	// Com o babel em português, `"` é um atalho (`"a` vira "ª")
	'"': '\\textquotedbl{}',
}

const LATEX_UNESCAPES = Object.fromEntries(Object.entries(LATEX_ESCAPES).map(([char, command]) => [command.slice(1, -2), char]))

const normalizeTitle = (title: string) =>
	latexToPlainText(title)
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[:.]\s*$/, '')
		.trim()

const ALIAS_KEYS = new Map(
	(Object.entries(SECTION_ALIASES) as [SectionKey, string[]][]).flatMap(([key, aliases]) =>
		aliases.map(alias => [normalizeTitle(alias), key] as const),
	),
)

/** A seção de um título do `.tex` (`\section*{título}`), ou `undefined` se não for nenhuma das conhecidas. */
export function sectionKey(title: string): SectionKey | undefined {
	const normalized = normalizeTitle(title)
	const exact = ALIAS_KEYS.get(normalized)
	if (exact) return exact

	const keys = new Set(
		normalized
			.split(/\s*(?:[/&,]|\be\b|\band\b)\s*/)
			.filter(Boolean)
			.map(part => ALIAS_KEYS.get(part)),
	)
	const [key] = keys
	return keys.size === 1 ? key : undefined
}

/** Rótulo das tecnologias (ou ferramentas) de um projeto: `\textit{Tecnologias: a, b}`. */
export const PROJECT_SKILLS_LABEL = /(Tecnologias|Ferramentas|Competências|Technologies|Tools|Skills):\s*([^}]*)\}/

/** Remove os comandos LaTeX mais comuns, deixando só o texto. */
export function latexToPlainText(latex: string) {
	return (
		latex
			.replace(/(?<!\\)%.*$/gm, '')
			.replace(HREF, '$1')
			.replace(TEXT_STYLE, '$1')
			.replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, ' ')
			.replace(/\\begin\{[^}]*\}(?:\[[^\]]*\])?|\\end\{[^}]*\}|\\item\b/g, ' ')
			.replace(/\\(?:hfill|newline|noindent|centering|par)\b/g, ' ')
			.replace(/\\\\/g, ' ')
			.replace(/\\([&%$#_{}])/g, '$1')
			.replace(/~/g, ' ')
			// Depois do `~` acima, para o til escapado continuar til
			.replace(/\\(textbackslash|textasciitilde|textasciicircum|textquotedbl)\{\}/g, (_, name: string) => LATEX_UNESCAPES[name]!)
			.replace(/\s+/g, ' ')
			.trim()
	)
}

/**
 * Escapa o texto para aparecer igual no PDF. Numa passada só: as chaves de `\textbackslash{}` não podem ser escapadas
 * de novo.
 */
export function escapeLatex(text: string) {
	return text.replace(/[\\~^"&%$#_{}]/g, char => LATEX_ESCAPES[char] ?? `\\${char}`)
}

/** Divide "a, b (c, d), e" nas vírgulas fora de parênteses e chaves. */
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

/** Separa o corpo da seção em espaço inicial, conteúdo e espaço final, para remontá-lo igual. */
export function splitWhitespace(body: string) {
	const lead = body.match(/^\s*/)![0]
	const trail = body.slice(lead.length).match(/\s*$/)![0]
	return { lead, content: body.slice(lead.length, body.length - trail.length), trail }
}

export const SKILL_LINE = /^(\s*\\item\s+\\textbf\{)(.+?):\}(\s*)(.+?)\s*$/

/**
 * Separa os blocos de projeto e o separador entre eles. O separador inclui as linhas em branco do
 * `\vspace`: sem elas o LaTeX junta o projeto ao parágrafo anterior.
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

/**
 * Se o título escrito no formulário do site é reconhecido como a seção `key` (um dos sinônimos acima). Com outro
 * título, o ajuste à vaga não acharia a seção no `.tex` gerado. Vazio vale: o gerador usa o título padrão.
 */
export function isSectionTitle(key: SectionKey, title: string) {
	return !title.trim() || sectionKey(escapeLatex(title.trim())) === key
}
