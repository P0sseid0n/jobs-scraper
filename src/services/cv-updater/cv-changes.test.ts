import { describe, expect, test } from 'bun:test'

import { cvChanges } from './cv-changes'
import type { ResumeContent } from './resume/resume.types'
import type { TailoringReport } from './tailor-resume'

const base: ResumeContent = {
	summary: 'Desenvolvedora front-end.',
	skills: [{ category: 'Front-end', items: ['Vue', 'jQuery'] }],
	projects: [
		{ name: 'Loja', description: 'Loja virtual', technologies: ['Vue'] },
		{ name: 'Painel', description: 'Painel de vendas', technologies: ['React'] },
	],
	experience: [],
	otherSections: [],
	fullText: '',
}

const report: TailoringReport = {
	relevantSkills: ['Vue'],
	addedSkills: [{ skill: 'Angular', category: 'Front-end' }],
	removedSkills: ['jQuery'],
	unsupportedSkills: [],
	summaryRejected: null,
}

describe('cvChanges', () => {
	test('lista as habilidades que entraram e saíram e os projetos na ordem do PDF', () => {
		const resume = { ...base, projects: [base.projects[1]!] }

		expect(cvChanges(base, resume, report)).toEqual({
			addedSkills: ['Angular'],
			removedSkills: ['jQuery'],
			summary: null,
			projects: ['Painel'],
		})
	})

	test('traz a apresentação de antes e a nova quando ela mudou', () => {
		const resume = { ...base, summary: 'Desenvolvedora front-end com Angular.' }

		expect(cvChanges(base, resume, report).summary).toEqual({
			before: 'Desenvolvedora front-end.',
			after: 'Desenvolvedora front-end com Angular.',
		})
	})

	test('a apresentação igual à do currículo base (só com espaços a mais) não conta como trocada', () => {
		expect(cvChanges(base, { ...base, summary: ' Desenvolvedora front-end. ' }, report).summary).toBeNull()
	})
})
