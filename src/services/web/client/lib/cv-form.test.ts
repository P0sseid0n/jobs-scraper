import { describe, expect, test } from 'bun:test'

import { CvFormSchema, type CvForm } from '@shared/contracts'

import { cleanForm, emptyForm, emptySection, formProblems, formSteps, moveItem, problemStep, sameForm, stepProblems } from './cv-form'

const contact = { name: 'Maria', headline: '', location: '', email: '', phone: '', links: [] }

describe('formulário do currículo base', () => {
	test('o formulário vazio e as seções novas passam no schema do servidor', () => {
		const form = emptyForm()
		form.sections.push(emptySection('certifications'), emptySection('languages'), emptySection('projects'))

		expect(CvFormSchema.safeParse({ ...form, contact }).success).toBe(true)
	})

	test('limpa linhas em branco, itens vazios e espaços do título antes de enviar', () => {
		const form: CvForm = {
			contact: { ...contact, name: ' Maria ', links: ['', ' linkedin.com/in/maria '] },
			sections: [
				{ kind: 'summary', title: ' Sobre mim ', text: '  Enfermeira.  ' },
				{
					kind: 'skills',
					title: '',
					groups: [
						{ category: 'Gestão', items: [] },
						{ category: '', items: [' Excel '] },
					],
				},
				{
					kind: 'experience',
					title: '',
					entries: [
						{ role: 'Enfermeira', company: '', period: '', bullets: ['', ' Plantões. ', '  '] },
						{ role: '', company: '', period: '', bullets: [''] },
					],
				},
				{
					kind: 'projects',
					title: '',
					toolsLabel: 'Tecnologias',
					entries: [{ name: ' ', url: '', description: '', technologies: [] }],
				},
			],
		}

		expect(cleanForm(form)).toEqual({
			contact: { ...contact, name: ' Maria ', links: ['linkedin.com/in/maria'] },
			sections: [
				{ kind: 'summary', title: 'Sobre mim', text: 'Enfermeira.' },
				{ kind: 'skills', title: '', groups: [{ category: '', items: ['Excel'] }] },
				{ kind: 'experience', title: '', entries: [{ role: 'Enfermeira', company: '', period: '', bullets: ['Plantões.'] }] },
				{ kind: 'projects', title: '', toolsLabel: 'Tecnologias', entries: [] },
			],
		})
	})

	test('pede o nome e uma experiência ou formação preenchida', () => {
		expect(formProblems(emptyForm())).toEqual({
			'contact.name': 'Preencha o nome.',
			sections: 'Preencha pelo menos uma experiência ou uma formação.',
		})

		const form = emptyForm()
		form.contact.name = 'Maria'
		form.sections = [
			{ kind: 'education', title: 'Formação Acadêmica', entries: [{ course: 'Enfermagem', institution: '', period: '' }] },
		]
		expect(formProblems(form)).toEqual({})
	})

	test('recusa um título que o cv-updater não reconhece como a seção', () => {
		const form: CvForm = {
			contact,
			sections: [
				{ kind: 'skills', title: 'Experiência', groups: [] },
				{ kind: 'education', title: 'Formação', entries: [{ course: 'Enfermagem', institution: '', period: '' }] },
			],
		}

		expect(Object.keys(formProblems(form))).toEqual(['sections.0.title'])
	})

	test('aponta o item com tópicos demais pela posição na tela', () => {
		const bullets = Array.from({ length: 21 }, (_, index) => `Tópico ${index}`)
		const form: CvForm = {
			contact,
			sections: [
				{ kind: 'summary', title: '', text: '' },
				{
					kind: 'experience',
					title: '',
					entries: [
						{ role: '', company: '', period: '', bullets: [] },
						{ role: 'Enfermeira', company: '', period: '', bullets },
					],
				},
			],
		}

		expect(formProblems(form)).toEqual({ 'sections.1.entries.1.bullets': 'No máximo 20 tópicos.' })
	})

	test('as etapas seguem as seções incluídas, e cada problema leva à etapa do campo', () => {
		const form = emptyForm()

		expect(formSteps(form)).toEqual(['contact', 'sections', 'summary', 'skills', 'experience', 'education', 'review'])
		expect(problemStep('contact.name', form)).toBe('contact')
		expect(problemStep('sections', form)).toBe('sections')
		expect(problemStep('sections.2.entries.0.bullets', form)).toBe('experience')
		expect(problemStep('sections.0.title', form)).toBe('summary')

		const problems = { 'contact.name': 'a', 'sections.1.title': 'b', sections: 'c' }
		expect(stepProblems('skills', problems, form)).toEqual({ 'sections.1.title': 'b' })
	})

	test('move um item para cima ou para baixo, sem passar das pontas', () => {
		expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
		expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
		expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
	})

	test('linhas em branco não contam como mudança', () => {
		const form = emptyForm()
		const edited = emptyForm()
		edited.contact.links = ['']

		expect(sameForm(form, edited)).toBe(true)
		edited.contact.name = 'Maria'
		expect(sameForm(form, edited)).toBe(false)
	})
})
