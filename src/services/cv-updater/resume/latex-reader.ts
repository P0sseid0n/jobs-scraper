/** Lê o `.tex` do currículo e extrai o conteúdo de cada seção em texto puro (formato em latex-syntax.ts). */
import {
	ITEMIZE,
	latexToPlainText,
	PROJECT_SKILLS_LABEL,
	sectionKey,
	SKILL_LINE,
	splitItems,
	splitProjectBlocks,
	splitTopLevel,
	splitWhitespace,
	type SectionKey,
} from './latex-syntax'
import type { ParsedResume, ResumeContent } from './resume.types'

const READ_ONLY_SECTIONS: readonly SectionKey[] = ['education', 'certifications', 'languages']

const PROJECT_SKILLS_LINE = new RegExp(`\\\\textit\\{${PROJECT_SKILLS_LABEL.source}`)

export function readResumeTex(tex: string): ParsedResume {
	const { sections, titles } = findSections(tex)

	const body = (key: SectionKey) => {
		const range = sections[key]
		return range ? tex.slice(range.start, range.end) : ''
	}

	const skills = parseSkills(body('skills'))
	const projects = parseProjects(body('projects'))
	const experience = parseExperience(body('experience'))
	const documentBody = tex.slice(tex.indexOf('\\begin{document}') + 1)

	return {
		tex,
		sections,
		model: {
			summary: latexToPlainText(body('summary')),
			skills: skills.groups,
			projects: projects.projects,
			experience: experience.entries,
			otherSections: READ_ONLY_SECTIONS.filter(key => sections[key]).map(key => ({
				title: titles[key]!,
				text: latexToPlainText(body(key)),
			})),
			fullText: latexToPlainText(documentBody),
		},
		raw: { skillLines: skills.raw, projects: projects.raw, projectSkillsLabel: projects.label, bullets: experience.raw },
	}
}

/**
 * Localiza o corpo de cada seção conhecida: do fim do `\section*{...}` até a próxima seção. O título pode ser
 * qualquer sinônimo aceito (ver `sectionKey`); se a mesma seção aparecer duas vezes, vale a primeira.
 */
function findSections(tex: string) {
	const headers = [...tex.matchAll(/\\section\*?\{([^}]*)\}/g)]
	const documentEnd = tex.indexOf('\\end{document}')
	const sections: ParsedResume['sections'] = {}
	const titles: Partial<Record<SectionKey, string>> = {}

	headers.forEach((header, index) => {
		const key = sectionKey(header[1]!)
		if (!key || sections[key]) return

		const start = header.index! + header[0].length
		const end = headers[index + 1]?.index ?? (documentEnd === -1 ? tex.length : documentEnd)

		sections[key] = { start, end }
		titles[key] = latexToPlainText(header[1]!)
	})

	return { sections, titles }
}

function parseSkills(body: string) {
	const groups: ResumeContent['skills'] = []
	const raw: ParsedResume['raw']['skillLines'] = new Map()

	for (const line of body.split('\n')) {
		const match = line.match(SKILL_LINE)
		if (!match) continue

		const [, open, rawCategory, gap, rawItems] = match
		const category = latexToPlainText(rawCategory!)
		const items = new Map(splitTopLevel(rawItems!).map(item => [latexToPlainText(item), item]))

		groups.push({ category, items: [...items.keys()] })
		raw.set(category, { prefix: `${open}${rawCategory}:}${gap}`, items })
	}

	return { groups, raw }
}

function parseProjects(body: string) {
	const projects: ResumeContent['projects'] = []
	const raw: ParsedResume['raw']['projects'] = new Map()
	let label: string | undefined

	for (const block of splitProjectBlocks(splitWhitespace(body).content).blocks) {
		const name = block.match(/\\textbf\{([^}]*)\}/)?.[1]
		if (!name) continue

		const [, blockLabel, technologies] = block.match(PROJECT_SKILLS_LABEL) ?? []
		label ??= blockLabel
		const url = block.match(/\\href\{[^}]*\}\{([^}]*)\}/)?.[1]

		// A primeira linha é o cabeçalho (nome | link); a descrição é o que vem depois, sem a linha de tecnologias
		const [, ...rest] = block.split(/\n\s*\n/)
		const description = rest.join('\n\n').replace(PROJECT_SKILLS_LINE, '')

		projects.push({
			name: latexToPlainText(name),
			...(url ? { url: latexToPlainText(url) } : {}),
			description: latexToPlainText(description),
			technologies: technologies ? splitTopLevel(technologies).map(latexToPlainText) : [],
		})
		raw.set(latexToPlainText(name), block)
	}

	return { projects, raw, label: label ?? 'Tecnologias' }
}

/** Lê a experiência: cada `itemize` é uma entrada e o texto antes dele, o cabeçalho (empresa, cargo, período). */
function parseExperience(body: string) {
	const entries: ResumeContent['experience'] = []
	const raw: ParsedResume['raw']['bullets'] = []
	let previousEnd = 0

	for (const match of body.matchAll(ITEMIZE)) {
		const header = latexToPlainText(body.slice(previousEnd, match.index))
		previousEnd = match.index! + match[0].length

		const { items } = splitItems(match[2]!)
		const bullets = new Map(items.map(item => [latexToPlainText(item.replace(/^\\item\b/, '')), item]))

		entries.push({ header, bullets: [...bullets.keys()] })
		raw.push(bullets)
	}

	return { entries, raw }
}
