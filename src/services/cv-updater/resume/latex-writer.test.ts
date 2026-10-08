import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './latex-reader'
import { projectToLatex } from './latex-writer'
import type { ResumeProject } from './resume.types'

describe('bloco LaTeX de projeto', () => {
	test('bloco de projeto novo segue o formato do currículo e é lido de volta', () => {
		const project: ResumeProject = {
			name: 'Placar',
			url: 'github.com/fulano/Placar',
			description: 'Placar em tempo real & compartilhado.',
			technologies: ['Vue.js', 'Nuxt.js'],
		}
		const block = projectToLatex(project)

		expect(block).toBe(
			'\\textbf{Placar} | \\href{https://github.com/fulano/Placar}{github.com/fulano/Placar}\n\nPlacar em tempo real \\& compartilhado.\n\n\\textit{Tecnologias: Vue.js, Nuxt.js}',
		)
		const parsed = readResumeTex(`\\begin{document}\n\\section*{Projetos}\n\n${block}\n\n\\end{document}`)
		expect(parsed.model.projects).toEqual([project])
	})
})
