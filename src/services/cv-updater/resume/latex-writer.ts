/** Gera o `.tex` ajustado reescrevendo só os corpos das seções; o resto do arquivo fica idêntico. */
import {
	EDITABLE_SECTIONS,
	escapeLatex,
	ITEMIZE,
	SKILL_LINE,
	splitItems,
	splitProjectBlocks,
	splitWhitespace,
	type EditableSection,
} from './latex-syntax'
import type { ParsedResume, Range, ResumeProject, TailoredResume } from './resume.types'

export function writeResumeTex(parsed: ParsedResume, cv: TailoredResume) {
	const renderers: Record<EditableSection, (body: string) => string> = {
		summary: body => renderSummary(parsed, body, cv.summary),
		skills: body => renderSkills(parsed, body, cv),
		projects: body => renderProjects(parsed, body, cv),
		experience: body => renderExperience(parsed, body, cv),
	}

	// Só as seções editáveis; de trás para frente, para os índices das seções anteriores continuarem válidos
	const sections = EDITABLE_SECTIONS.flatMap(key => {
		const range = parsed.sections[key]
		return range ? [[key, range] as [EditableSection, Range]] : []
	}).sort(([, a], [, b]) => b.start - a.start)

	let tex = parsed.tex
	for (const [key, range] of sections) {
		tex = tex.slice(0, range.start) + renderers[key](tex.slice(range.start, range.end)) + tex.slice(range.end)
	}

	return tex
}

/** Gera o bloco LaTeX de um projeto novo, no formato dos projetos do currículo base (`label`: "Tecnologias", ...). */
export function projectToLatex(project: ResumeProject, label = 'Tecnologias') {
	const url = project.url ? ` | \\href{https://${project.url}}{${escapeLatex(project.url)}}` : ''
	const technologies = project.technologies.length
		? `\n\n\\textit{${label}: ${project.technologies.map(escapeLatex).join(', ')}}`
		: ''

	return `\\textbf{${escapeLatex(project.name)}}${url}\n\n${escapeLatex(project.description)}${technologies}`
}

function renderSummary(parsed: ParsedResume, body: string, summary: string) {
	// Sem mudança, mantém o trecho original exatamente como está (inclusive as quebras de linha)
	if (summary === parsed.model.summary) return body

	const { lead, trail } = splitWhitespace(body)
	return `${lead}${escapeLatex(summary)}${trail}`
}

function renderSkills(parsed: ParsedResume, body: string, cv: TailoredResume) {
	const lines = body.split('\n')
	const slots = lines.flatMap((line, index) => (SKILL_LINE.test(line) ? [index] : []))

	// Itens existentes mantêm o LaTeX original; itens novos (adicionados da vaga) são escapados
	const rendered = cv.skills.flatMap(group => {
		const raw = parsed.raw.skillLines.get(group.category)
		if (!raw || group.items.length === 0) return []

		const items = group.items.map(item => raw.items.get(item) ?? escapeLatex(item))
		return [`${raw.prefix}${items.join(', ')}`]
	})

	if (rendered.length === 0 || rendered.length > slots.length) return body

	// As linhas ocupam as primeiras posições; as posições que sobrarem (categorias removidas) são apagadas
	slots.forEach((slot, index) => {
		lines[slot] = rendered[index] ?? ''
	})

	const removed = new Set(slots.slice(rendered.length))
	return lines.filter((_, index) => !removed.has(index)).join('\n')
}

function renderProjects(parsed: ParsedResume, body: string, cv: TailoredResume) {
	if (cv.projects.length === 0) return body

	const { lead, content, trail } = splitWhitespace(body)
	const { separator } = splitProjectBlocks(content)

	// Projetos do .tex mantêm o bloco original; projetos novos (do GitHub) seguem o mesmo formato
	const blocks = cv.projects.map(
		project => parsed.raw.projects.get(project.name) ?? projectToLatex(project, parsed.raw.projectSkillsLabel),
	)

	return `${lead}${blocks.join(separator)}${trail}`
}

function renderExperience(parsed: ParsedResume, body: string, cv: TailoredResume) {
	let entryIndex = 0

	return body.replace(ITEMIZE, (whole, options: string | undefined, inner: string) => {
		const raw = parsed.raw.bullets[entryIndex]
		const entry = cv.experience[entryIndex++]
		if (!raw || !entry || entry.bullets.length !== raw.size) return whole

		const ordered = entry.bullets.map(bullet => raw.get(bullet))
		if (ordered.some(item => item === undefined)) return whole

		// O espaço depois de cada item pertence à posição (o último antecede \end{itemize}), não ao item
		const { before, items } = splitItems(inner)
		const trails = items.map(item => item.match(/\s*$/)![0])
		const bullets = ordered.map((item, index) => item!.trimEnd() + trails[index]).join('')

		return `\\begin{itemize}${options ?? ''}${before}${bullets}\\end{itemize}`
	})
}
