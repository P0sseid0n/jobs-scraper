import { describe, expect, test } from 'bun:test'

import { completeFromPdf, importedForm, moveSplitMonth, paragraphFromPdf, pdfCorpus } from './import-form'
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

describe('completeFromPdf e paragraphFromPdf', () => {
	const text = `Fulano da Silva
Desenvolvedor Full-Stack
Apresentação
Desenvolvedor Full-Stack especializado em TypeScript e Python, com foco em performance e sistemas modernos.
Experiente com Git, metodologias ágeis (Scrum, Kanban) e arquitetura escalável (SOLID, Design Patterns). Com-
prometido com a qualidade do código, boas práticas e evolução contínua no desenvolvimento web.
Habilidades Técnicas
• Front-end: HTML, CSS
Experiência Profissional
• Desenvolvimento e manutenção de interfaces responsivas com Nuxt.js (Vue 2 e Vue 3), React e
TypeScript.
• Integração de APIs RESTful.
Clínica Exemplo Janeiro 2019 - Fevereiro 2021`

	const paragraph =
		'Desenvolvedor Full-Stack especializado em TypeScript e Python, com foco em performance e sistemas modernos. Experiente com Git, metodologias ágeis (Scrum, Kanban) e arquitetura escalável (SOLID, Design Patterns). Comprometido com a qualidade do código, boas práticas e evolução contínua no desenvolvimento web.'

	test('a apresentação sai do PDF até o próximo título, sem o hífen da quebra, cortada ou com palavra errada', () => {
		// Cortada na primeira quebra de linha
		expect(paragraphFromPdf(paragraph.split('. ')[0]!, text)).toBe(paragraph)
		// Inteira, mas com a palavra hifenizada errada
		expect(paragraphFromPdf(paragraph.replace('Comprometido', 'Prometido'), text)).toBe(paragraph)
	})

	test('apresentação que não começa uma linha do PDF fica vazia', () => {
		expect(paragraphFromPdf('Enfermeira experiente.', text)).toBe('')
		expect(paragraphFromPdf('metodologias ágeis (Scrum, Kanban)', text)).toBe('')
		expect(paragraphFromPdf('', text)).toBe('')
	})

	test('o tópico continua na linha seguinte só enquanto a frase não terminou', () => {
		const cut = 'Desenvolvimento e manutenção de interfaces responsivas com Nuxt.js (Vue 2 e Vue 3), React e'

		expect(completeFromPdf(cut, text)).toBe(`${cut} TypeScript.`)
		// Terminada a frase, a linha seguinte (o próximo emprego) não entra
		expect(completeFromPdf('Integração de APIs RESTful.', text)).toBe('Integração de APIs RESTful.')
		expect(completeFromPdf('Outra coisa', text)).toBe('Outra coisa')
	})
})

describe('moveSplitMonth', () => {
	const inPdf = pdfCorpus({
		text: 'OTI Software Abril 2022 - Presente\nHotel Beira Mar 2020 - 2022\nUnicesumar - Análise e Desenvolvimento de Sistemas Maio 2023 - Dezembro 2025',
		links: [],
		pages: 1,
	})
	const job = (company: string, period: string) => ({ role: 'Dev', company, period, bullets: [] })

	test('o mês que ficou no fim da empresa volta ao período', () => {
		expect(moveSplitMonth(job('OTI Software Abril', '2022 - Presente'), ['company', 'role'], inPdf)).toEqual(
			job('OTI Software', 'Abril 2022 - Presente'),
		)
	})

	test('na formação, o mês que ficou no fim do curso', () => {
		const entry = { course: 'Análise e Desenvolvimento de Sistemas Maio', institution: 'Unicesumar', period: '2023 - Dezembro 2025' }
		expect(moveSplitMonth(entry, ['course', 'institution'], inPdf)).toEqual({
			course: 'Análise e Desenvolvimento de Sistemas',
			institution: 'Unicesumar',
			period: 'Maio 2023 - Dezembro 2025',
		})
	})

	test('não mexe no período com o mês, em abreviação que é palavra, nem sem os dois juntos no PDF', () => {
		const cases = [
			job('OTI Software', 'Abril 2022 - Presente'),
			job('Hotel Beira Mar', '2020 - 2022'),
			job('OTI Software Abril', '2023 - Presente'),
		]
		for (const entry of cases) expect(moveSplitMonth(entry, ['company', 'role'], inPdf)).toEqual(entry)
	})
})
