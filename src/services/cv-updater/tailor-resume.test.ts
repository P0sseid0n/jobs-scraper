import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './resume/latex-reader'
import { tailorResumeToJob } from './tailor-resume'
import type { TailoringSuggestions } from './tailoring-prompt'

const { model: cv } = readResumeTex(await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text())

const job = {
	title: 'Dev Front-end',
	company: 'Acme',
	necessary_knowledge: ['Vue 3', 'TypeScript', 'CSS3/SCSS', 'Angular', 'REST APIs'],
	rawContent: 'Vaga',
}

const summary =
	'Desenvolvedor Full-Stack focado em front-end com Vue.js, TypeScript e Angular, construindo interfaces performáticas e integrando APIs REST com qualidade de código.'

const output = (overrides: Partial<TailoringSuggestions> = {}): TailoringSuggestions => ({
	summary,
	relevantSkills: ['React', 'Kubernetes', 'HTML5'],
	relevantProjects: ['Inexistente', 'Painel Exemplo'],
	addedSkills: [{ skill: 'Angular', category: 'Front-end' }],
	...overrides,
})

describe('tailorResumeToJob', () => {
	test('adiciona as techs da vaga na categoria escolhida e mantém só as categorias relacionadas', () => {
		const { cv: tailored, report } = tailorResumeToJob(cv, job, output())

		expect(tailored.skills).toEqual([
			// Categorias com tech da vaga ficam inteiras, com as da vaga primeiro
			{ category: 'Front-end', items: ['Vue.js', 'CSS (SASS/SCSS)', 'Angular', 'React', 'HTML'] },
			{ category: 'Linguagens', items: ['JavaScript / TypeScript', 'Python'] },
			// Completa até o mínimo de habilidades com as próximas do currículo, na ordem original
			{ category: 'Back-end', items: ['Node.js', 'Express'] },
		])
		expect(report.addedSkills).toEqual([{ skill: 'Angular', category: 'Front-end' }])
		expect(report.removedSkills).toEqual(['PostgreSQL', 'Git', 'Docker'])
		expect(report.relevantSkills).toEqual(['Vue.js', 'JavaScript / TypeScript', 'CSS (SASS/SCSS)', 'React', 'HTML'])
	})

	test('reordena projetos e bullets, sem criar nem remover itens', () => {
		const { cv: tailored } = tailorResumeToJob(cv, job, output())

		expect(tailored.projects.map(project => project.name)).toEqual(['Painel Exemplo', 'Loja Exemplo'])
		expect(tailored.experience[0]?.bullets[0]).toBe('Desenvolvimento de interfaces com Vue.js e TypeScript.')
		expect([...tailored.experience[0]!.bullets].sort()).toEqual([...cv.experience[0]!.bullets].sort())
	})

	test('conceitos e metodologias da vaga não entram como tecnologia', () => {
		const conceptJob = { ...job, necessary_knowledge: ['Vue 3', 'Component-driven architecture', 'Agile/Scrum', 'Git workflows'] }
		const { cv: tailored, report } = tailorResumeToJob(cv, conceptJob, null)

		expect(report.addedSkills).toEqual([])
		// "Git workflows" casa com o "Git" do currículo
		expect(report.relevantSkills).toEqual(['Vue.js', 'Git'])
		expect(tailored.skills.flatMap(group => group.items)).toContain('Git')
	})

	test('nuvem e DevOps vão para a categoria de ferramentas, mesmo se a IA escolher outra', () => {
		const cloudJob = { ...job, necessary_knowledge: ['AWS', 'Azure'] }
		const { report } = tailorResumeToJob(cv, cloudJob, output({ addedSkills: [{ skill: 'AWS', category: 'Back-end' }] }))
		expect(report.addedSkills).toEqual([
			{ skill: 'AWS', category: 'Ferramentas & DevOps' },
			{ skill: 'Azure', category: 'Ferramentas & DevOps' },
		])
	})

	test('"skip" da IA não adiciona itens que não são tecnologias', () => {
		const { report } = tailorResumeToJob(cv, job, output({ addedSkills: [{ skill: 'Angular', category: 'skip' }] }))
		expect(report.addedSkills).toEqual([])
	})

	test('sem resposta da IA, adiciona as techs da vaga na categoria de ferramentas', () => {
		const { cv: tailored, report } = tailorResumeToJob(cv, job, null)

		expect(report.addedSkills).toEqual([{ skill: 'Angular', category: 'Ferramentas & DevOps' }])
		expect(tailored.summary).toBe(cv.summary)
		expect(report.relevantSkills).toContain('Vue.js')
	})

	test('a apresentação pode citar as techs da vaga; só o tamanho é validado', () => {
		expect(tailorResumeToJob(cv, job, output()).cv.summary).toBe(summary)

		const { cv: tailored, report } = tailorResumeToJob(cv, job, output({ summary: 'Curta demais.' }))
		expect(tailored.summary).toBe(cv.summary)
		expect(report.summaryRejected).toContain('tamanho')
	})
})
