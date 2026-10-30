import { describe, expect, test } from 'bun:test'

import { importedForm, pdfCorpus } from './import-form'
import type { ImportOutput } from './import-prompt'
import type { PdfText } from './pdf-text'

const pdf: PdfText = {
	text: `Maria Souza
Enfermeira | COREN-SP 000.000
maria@example.com | (11) 90000-0000
Experiência
Hospital Exemplo Março 2021 – Presente
Enfermeira Assistencial - UTI Adulto
• Assistência a pacientes críticos, com até 10 leitos por plan-
tão.
Formação
Universidade Exemplo - Bacharelado em Enfermagem 2014 - 2018
Resumo
Enfermeira com experiência em clínica médica e terapia intensiva.
Idiomas
Inglês intermediário; espanhol básico.`,
	links: ['https://linkedin.com/in/maria'],
	pages: 1,
}

const output = (overrides: Partial<ImportOutput> = {}): ImportOutput => ({
	contact: {
		name: 'Maria Souza',
		headline: 'Enfermeira | COREN-SP 000.000',
		location: '',
		email: 'maria@example.com',
		phone: '(11) 90000-0000',
		links: ['linkedin.com/in/maria'],
	},
	summary: 'Enfermeira com experiência em clínica médica e terapia intensiva.',
	skills: [],
	experience: [
		{
			role: 'Enfermeira Assistencial - UTI Adulto',
			company: 'Hospital Exemplo',
			period: 'Março 2021 - Presente',
			bullets: ['Assistência a pacientes críticos, com até 10 leitos por plantão.'],
		},
	],
	education: [{ course: 'Bacharelado em Enfermagem', institution: 'Universidade Exemplo', period: '2014 - 2018' }],
	certifications: [],
	languages: [
		{ language: 'Inglês', level: 'intermediário' },
		{ language: 'Espanhol', level: 'básico' },
	],
	projects: [],
	...overrides,
})

describe('pdfCorpus', () => {
	const inPdf = pdfCorpus(pdf)

	test('acha o texto sem diferenciar maiúsculas, quebras de linha, traços e o https:// dos links', () => {
		expect(inPdf('MARIA SOUZA')).toBe(true)
		expect(inPdf('Hospital Exemplo Março 2021 - Presente')).toBe(true)
		expect(inPdf('Exemplo\nMarço')).toBe(true)
		expect(inPdf('https://www.linkedin.com/in/maria/')).toBe(true)
		// A palavra hifenizada na quebra de linha, como o modelo a copia
		expect(inPdf('leitos por plantão.')).toBe(true)
	})

	test('não acha o que não está no PDF, nem o vazio', () => {
		expect(inPdf('Enfermeira Chefe')).toBe(false)
		expect(inPdf('English')).toBe(false)
		expect(inPdf('  ')).toBe(false)
	})
})

describe('importedForm', () => {
	test('preenche o formulário com as seções na ordem do PDF e sem as vazias (sem projetos, de outra área)', () => {
		const { form, dropped } = importedForm(output(), pdf)

		expect(dropped).toBe(0)
		expect(form.contact).toEqual({
			name: 'Maria Souza',
			headline: 'Enfermeira | COREN-SP 000.000',
			location: '',
			email: 'maria@example.com',
			phone: '(11) 90000-0000',
			links: ['linkedin.com/in/maria'],
		})
		expect(form.sections.map(section => section.kind)).toEqual(['experience', 'education', 'summary', 'languages'])
		expect(form.sections[1]).toEqual({
			kind: 'education',
			title: '',
			entries: [{ course: 'Bacharelado em Enfermagem', institution: 'Universidade Exemplo', period: '2014 - 2018' }],
		})
	})

	test('descarta o que o modelo inventou, traduziu ou reescreveu, e o item que fica vazio', () => {
		const { form, dropped } = importedForm(
			output({
				contact: { ...output().contact, location: 'São Paulo, SP' },
				summary: 'Enfermeira experiente, focada em terapia intensiva.',
				skills: [{ category: 'Soft skills', items: ['Trabalho em equipe'] }],
				experience: [{ ...output().experience[0]!, period: '2021 - atual', bullets: ['Liderança da equipe de enfermagem.'] }],
				languages: [{ language: 'English', level: 'intermediate' }],
			}),
			pdf,
		)

		expect(dropped).toBe(8)
		expect(form.contact.location).toBe('')
		expect(form.sections.map(section => section.kind)).toEqual(['experience', 'education'])
		expect(form.sections[0]).toEqual({
			kind: 'experience',
			title: '',
			entries: [{ role: 'Enfermeira Assistencial - UTI Adulto', company: 'Hospital Exemplo', period: '', bullets: [] }],
		})
	})

	test('apresentação sem título fica em primeiro; seções sem título vão para o fim', () => {
		const text = pdf.text.replace('Resumo\n', '').replace('Formação\n', '')
		const { form } = importedForm(output(), { ...pdf, text })

		expect(form.sections.map(section => section.kind)).toEqual(['summary', 'experience', 'languages', 'education'])
	})

	test('corta o que passa dos limites do formulário', () => {
		const bullets = Array.from({ length: 25 }, (_, index) => `Plantão ${index + 1}`)
		const { form } = importedForm(output({ experience: [{ ...output().experience[0]!, bullets }] }), {
			...pdf,
			text: `${pdf.text}\n${bullets.join('\n')}`,
		})

		const experience = form.sections.find(section => section.kind === 'experience')
		expect(experience?.kind === 'experience' && experience.entries[0]?.bullets).toHaveLength(20)
	})

	test('sem o título de idiomas no PDF, não há idiomas (o modelo devolve as linguagens de programação)', () => {
		const text = `${pdf.text.replace('Idiomas\n', '')}\nLinguagens: Python`
		const { form } = importedForm(output({ languages: [{ language: 'Python', level: '' }] }), { ...pdf, text })

		expect(form.sections.map(section => section.kind)).not.toContain('languages')
	})

	test('os links dos projetos saem do contato', () => {
		const text = `${pdf.text}\nProjetos\nPortal da Saúde | github.com/maria/portal`
		const { form } = importedForm(
			output({
				contact: { ...output().contact, links: ['linkedin.com/in/maria', 'https://github.com/maria/portal'] },
				projects: [{ name: 'Portal da Saúde', url: 'github.com/maria/portal', description: '', technologies: [] }],
			}),
			{ ...pdf, text },
		)

		expect(form.contact.links).toEqual(['linkedin.com/in/maria'])
	})

	test('os projetos usam o rótulo das ferramentas do PDF', () => {
		const text = `${pdf.text}\nProjetos\nPortal da Saúde\nTecnologias: Excel`
		const { form } = importedForm(
			output({ projects: [{ name: 'Portal da Saúde', url: '', description: '', technologies: ['Excel'] }] }),
			{ ...pdf, text },
		)

		expect(form.sections.at(-1)).toEqual({
			kind: 'projects',
			title: '',
			entries: [{ name: 'Portal da Saúde', url: '', description: '', technologies: ['Excel'] }],
			toolsLabel: 'Tecnologias',
		})
	})
})
