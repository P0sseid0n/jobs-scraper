/** Lê o `.tex` do currículo e extrai o conteúdo de cada seção em texto puro (formato em latex-syntax.ts). */
import {
	ITEMIZE,
	latexToPlainText,
	SECTION_TITLES,
	SKILL_LINE,
	splitItems,
	splitProjectBlocks,
	splitTopLevel,
	splitWhitespace,
} from './latex-syntax'
import type { ParsedResume, ResumeContent } from './resume.types'

type SectionKey = keyof typeof SECTION_TITLES

export function readResumeTex(tex: string): ParsedResume {
	const sections = findSections(tex)

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
			fullText: latexToPlainText(documentBody),
		},
		raw: { skillLines: skills.raw, projects: projects.raw, bullets: experience.raw },
	}
}

/** Onde começa e termina o corpo de cada seção conhecida (do fim do `\section*{...}` até a próxima seção). */
function findSections(tex: string): ParsedResume['sections'] {
	const headers = [...tex.matchAll(/\\section\*?\{([^}]*)\}/g)]
	const documentEnd = tex.indexOf('\\end{document}')
	const sections: ParsedResume['sections'] = {}

	headers.forEach((header, index) => {
		const key = (Object.keys(SECTION_TITLES) as SectionKey[]).find(candidate => SECTION_TITLES[candidate] === header[1]?.trim())
		if (!key) return

		const start = header.index! + header[0].length
		const end = headers[index + 1]?.index ?? (documentEnd === -1 ? tex.length : documentEnd)

		sections[key] = { start, end }
	})

	return sections
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

	for (const block of splitProjectBlocks(splitWhitespace(body).content).blocks) {
		const name = block.match(/\\textbf\{([^}]*)\}/)?.[1]
		if (!name) continue

		const technologies = block.match(/Tecnologias:\s*([^}]*)\}/)?.[1]
		const url = block.match(/\\href\{[^}]*\}\{([^}]*)\}/)?.[1]

		// A primeira linha é o cabeçalho (nome | link); a descrição é o que vem depois, sem a linha de tecnologias
		const [, ...rest] = block.split(/\n\s*\n/)
		const description = rest.join('\n\n').replace(/\\textit\{Tecnologias:[^}]*\}/, '')

		projects.push({
			name: latexToPlainText(name),
			...(url ? { url: latexToPlainText(url) } : {}),
			description: latexToPlainText(description),
			technologies: technologies ? splitTopLevel(technologies).map(latexToPlainText) : [],
		})
		raw.set(latexToPlainText(name), block)
	}

	return { projects, raw }
}

/** Cada `itemize` da seção é uma experiência; o texto antes dele é o cabeçalho (empresa, cargo, período). */
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
