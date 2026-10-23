import { describe, expect, test } from 'bun:test'

import { CvFormSchema, type CvForm } from '@shared/contracts'

import { cleanForm, emptyForm, emptySection, formProblems, moveItem, sameForm } from './cv-form'

const contact = { name: 'Maria', headline: '', location: '', email: '', phone: '', links: [] }

describe('formulário do currículo base', () => {
	test('o formulário vazio e as seções novas passam no schema do servidor', () => {
		const form = emptyForm()
		form.sections.push(emptySection('certifications'), emptySection('languages'), emptySection('projects'))

		expect(CvFormSchema.safeParse({ ...form, contact }).success).toBe(true)
	})

	test('limpa linhas em branco e itens vazios antes de enviar', () => {
		const form: CvForm = {
			contact: { ...contact, name: ' Maria ', links: ['', ' linkedin.com/in/maria '] },
			sections: [
				{ kind: 'summary', text: '  Enfermeira.  ' },
				{
					kind: 'skills',
					groups: [
						{ category: 'Gestão', items: [] },
						{ category: '', items: [' Excel '] },
					],
				},
				{
					kind: 'experience',
					entries: [
						{ role: 'Enfermeira', company: '', period: '', bullets: ['', ' Plantões. ', '  '] },
						{ role: '', company: '', period: '', bullets: [''] },
					],
				},
				{ kind: 'languages', entries: [{ language: ' ', level: '' }] },
			],
		}

		expect(cleanForm(form)).toEqual({
			contact: { ...contact, name: ' Maria ', links: ['linkedin.com/in/maria'] },
			sections: [
				{ kind: 'summary', text: 'Enfermeira.' },
				{ kind: 'skills', groups: [{ category: '', items: ['Excel'] }] },
				{ kind: 'experience', entries: [{ role: 'Enfermeira', company: '', period: '', bullets: ['Plantões.'] }] },
				{ kind: 'languages', entries: [] },
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
		form.sections = [{ kind: 'education', entries: [{ course: 'Enfermagem', institution: '', period: '' }] }]
		expect(formProblems(form)).toEqual({})
	})

	test('aponta o item com tópicos demais pela posição na tela', () => {
		const bullets = Array.from({ length: 21 }, (_, index) => `Tópico ${index}`)
		const form: CvForm = {
			contact,
			sections: [
				{ kind: 'summary', text: '' },
				{
					kind: 'experience',
					entries: [
						{ role: '', company: '', period: '', bullets: [] },
						{ role: 'Enfermeira', company: '', period: '', bullets },
					],
				},
			],
		}

		expect(formProblems(form)).toEqual({ 'sections.1.entries.1.bullets': 'No máximo 20 tópicos.' })
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
