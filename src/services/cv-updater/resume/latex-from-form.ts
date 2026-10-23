/**
 * Gera o `.tex` do currículo base a partir dos dados do formulário do site, com o preâmbulo do modelo neutro
 * (`assets/cv.neutral.example.tex`). Cada seção sai no formato que o latex-reader.ts lê, para o ajuste à vaga
 * funcionar como num `.tex` escrito à mão. Seções e itens vazios ficam de fora.
 */
import { CV_FORM_DEFAULT_TITLES, type CvForm, type CvFormSection, type CvFormSectionOf } from '@shared/contracts'

import neutralTex from '../assets/cv.neutral.example.tex' with { type: 'text' }
import { escapeLatex } from './latex-syntax'

const PREAMBLE = neutralTex.slice(0, neutralTex.indexOf('\\begin{document}'))

/** Gera o `.tex` completo do currículo do formulário. */
export function formToLatex(form: CvForm) {
	const name = escapeLatex(oneLine(form.contact.name))
	// Função no `replace`: um `$` no nome viraria um padrão de substituição
	const preamble = PREAMBLE.replace(/pdftitle=\{[^}]*\}/, () => `pdftitle={CV - ${name}}`).replace(
		/pdfauthor=\{[^}]*\}/,
		() => `pdfauthor={${name}}`,
	)

	const sections = form.sections.flatMap(section => {
		const body = renderSection(section)
		const title = escapeText(section.title) || CV_FORM_DEFAULT_TITLES[section.kind]
		return body ? [`\\section*{${title}}\n\n${body}`] : []
	})

	return `${preamble}\\begin{document}\n\n${renderHeader(form.contact)}\n\n${sections.join('\n\n')}\n\n\\end{document}\n`
}

function renderHeader(contact: CvForm['contact']) {
	const reach = [contact.email && href(`mailto:${contact.email}`, contact.email), escapeText(contact.phone)].filter(Boolean)
	const links = contact.links.filter(Boolean).map(url => href(withScheme(url), displayUrl(url)))

	const lines = [
		`{\\LARGE \\textbf{${escapeText(contact.name)}}}`,
		contact.headline && `\\textit{${escapeText(contact.headline)}}`,
		escapeText(contact.location),
		reach.join(' \\ | \\ '),
		links.join(' \\ | \\ '),
	].filter(Boolean)

	return `\\begin{center}\n${lines.map(line => `    ${line}`).join('\n\n')}\n\\end{center}\n\n\\vspace{8pt}`
}

/** O corpo da seção, ou `''` se ela não tem nada preenchido. */
function renderSection(section: CvFormSection): string {
	switch (section.kind) {
		case 'summary':
			return paragraphs(section.text)
		case 'skills':
			return renderSkills(section)
		case 'experience':
			return renderExperience(section)
		case 'education':
			return section.entries
				.map(({ course, institution, period }) => withPeriod(titled(institution, course, ' - '), period))
				.filter(Boolean)
				.join('\n\n')
		case 'certifications':
			return itemize(
				section.entries.map(({ name, issuer, year }) => [name, issuer, year].filter(Boolean).map(escapeText).join(' - ')),
			)
		case 'languages': {
			const languages = section.entries
				.filter(entry => entry.language)
				.map(({ language, level }) => (level ? `${escapeText(language)} (${escapeText(level)})` : escapeText(language)))
			return languages.length ? `${languages.join('; ')}.` : ''
		}
		case 'projects':
			return renderProjects(section)
	}
}

/** Linhas `\item \textbf{Categoria:} a, b`, o formato que o ajuste reordena; sem categoria, vale "Competências". */
function renderSkills({ groups }: CvFormSectionOf<'skills'>) {
	const lines = groups
		.map(group => ({ category: group.category || 'Competências', items: group.items.filter(Boolean) }))
		.filter(group => group.items.length)
		.map(group => `\\textbf{${escapeText(group.category)}:} ${group.items.map(escapeText).join(', ')}`)

	return itemize(lines, 'leftmargin=*, itemsep=4pt')
}

/** Cada experiência: empresa e período, o cargo em itálico e os tópicos num `itemize` (os bullets que o ajuste reordena). */
function renderExperience({ entries }: CvFormSectionOf<'experience'>) {
	return entries
		.map(({ role, company, period, bullets }) => {
			const header = withPeriod(company ? `\\textbf{${escapeText(company)}}` : role && `\\textbf{${escapeText(role)}}`, period)
			const lines = [header, company && role && `\\textit{${escapeText(role)}}`, itemize(bullets.map(escapeText))].filter(Boolean)
			return lines.join('\n\n')
		})
		.filter(Boolean)
		.join('\n\n')
}

/** Blocos separados por `\vspace`: nome e link, a descrição e as ferramentas (o formato do latex-reader.ts). */
function renderProjects({ entries, toolsLabel }: CvFormSectionOf<'projects'>) {
	return entries
		.filter(entry => entry.name)
		.map(({ name, url, description, technologies }) => {
			const header = `\\textbf{${escapeText(name)}}${url ? ` | ${href(withScheme(url), displayUrl(url))}` : ''}`
			const tools = technologies.filter(Boolean)
			return [header, escapeText(description), tools.length && `\\textit{${toolsLabel}: ${tools.map(escapeText).join(', ')}}`]
				.filter(Boolean)
				.join('\n\n')
		})
		.join('\n\n\\vspace{6pt}\n\n')
}

/** `\textbf{principal} - complemento`; sem o principal, o complemento vai em negrito. */
function titled(main: string, extra: string, separator: string) {
	if (!main) return extra && `\\textbf{${escapeText(extra)}}`
	return `\\textbf{${escapeText(main)}}${extra ? `${separator}${escapeText(extra)}` : ''}`
}

function withPeriod(line: string, period: string) {
	if (!line) return ''
	return period ? `${line} \\hfill ${escapeText(period)}` : line
}

function itemize(items: string[], options = 'leftmargin=*') {
	const lines = items.map(oneLine).filter(Boolean)
	if (!lines.length) return ''

	// Um `[` logo depois do `\item` seria lido como o rótulo do item
	const rendered = lines.map(line => `    \\item ${line.startsWith('[') ? '{}' : ''}${line}`)
	return `\\begin{itemize}[${options}]\n${rendered.join('\n')}\n\\end{itemize}`
}

/** Texto com parágrafos (linhas em branco entre eles), escapado; as quebras simples viram espaço. */
function paragraphs(text: string) {
	return text
		.split(/\n\s*\n/)
		.map(paragraph => escapeText(paragraph))
		.filter(Boolean)
		.join('\n\n')
}

/** O texto escapado e numa linha só: uma linha em branco no meio quebraria o item ou o cabeçalho. */
function escapeText(text: string) {
	return escapeLatex(oneLine(text))
}

function oneLine(text: string) {
	return text.replace(/\s+/g, ' ').trim()
}

function href(url: string, label: string) {
	return `\\href{${escapeUrl(url)}}{${escapeText(label)}}`
}

function withScheme(url: string) {
	return /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
}

/** O link como aparece no PDF: sem o `https://`, o `www.` nem a barra final. */
function displayUrl(url: string) {
	return url
		.replace(/^https?:\/\//i, '')
		.replace(/^www\./i, '')
		.replace(/\/$/, '')
}

/** O endereço dentro do `\href`: `%` e `#` escapados; chaves, barra invertida e espaços codificados. */
function escapeUrl(url: string) {
	return oneLine(url)
		.replace(/[\\{}\s]/g, char => encodeURIComponent(char))
		.replace(/[%#]/g, char => `\\${char}`)
}
