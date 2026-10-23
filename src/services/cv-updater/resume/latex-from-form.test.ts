import { describe, expect, test } from 'bun:test'

import { CV_FORM_DEFAULT_TITLES, CV_FORM_SECTIONS, CvFormSchema, type CvFormInput } from '@shared/contracts'

import { missingSections } from '../base-resume'
import { formToLatex } from './latex-from-form'
import { readResumeTex } from './latex-reader'
import { isSectionTitle, sectionKey } from './latex-syntax'

const contact: CvFormInput['contact'] = {
	name: 'Maria Souza',
	headline: 'Enfermeira',
	location: 'São Paulo, SP',
	email: 'maria@example.com',
	phone: '(11) 90000-0000',
	links: ['https://linkedin.com/in/maria/'],
}

const form: CvFormInput = {
	contact,
	sections: [
		{ kind: 'summary', text: 'Enfermeira com experiência em terapia intensiva.\n\nFocada em segurança do paciente.' },
		{
			kind: 'skills',
			groups: [
				{ category: 'Assistência', items: ['SAE', 'Curativos'] },
				{ category: '', items: ['Pacote Office'] },
			],
		},
		{
			kind: 'experience',
			entries: [
				{
					role: 'Enfermeira Assistencial',
					company: 'Hospital Exemplo',
					period: 'Março 2021 - Presente',
					bullets: ['Assistência a pacientes críticos.', 'Supervisão de técnicos.'],
				},
			],
		},
		{
			kind: 'education',
			entries: [{ course: 'Bacharelado em Enfermagem', institution: 'Universidade Exemplo', period: '2014 - 2018' }],
		},
		{ kind: 'certifications', entries: [{ name: 'ACLS', issuer: '', year: '2023' }] },
		{
			kind: 'languages',
			entries: [
				{ language: 'Inglês', level: 'intermediário' },
				{ language: 'Espanhol', level: '' },
			],
		},
		{
			kind: 'projects',
			entries: [
				{
					name: 'Guia de cuidados',
					url: 'github.com/maria/guia',
					description: 'Material para pacientes.',
					technologies: ['Canva'],
				},
			],
		},
	],
}

/** Gera o .tex como o servidor: o schema preenche os campos com padrão (título, rótulo das ferramentas). */
const latex = (form: CvFormInput) => formToLatex(CvFormSchema.parse(form))

describe('currículo gerado do formulário', () => {
	test('os títulos das seções são reconhecidos pelo leitor', () => {
		for (const kind of CV_FORM_SECTIONS) expect(sectionKey(CV_FORM_DEFAULT_TITLES[kind])).toBe(kind)
	})

	test('cada seção sai no formato que o leitor interpreta', () => {
		const tex = latex(form)
		const { model, sections } = readResumeTex(tex)

		expect(Object.keys(sections)).toEqual([...CV_FORM_SECTIONS])
		expect(missingSections(readResumeTex(tex))).toEqual([])
		expect(model.summary).toBe('Enfermeira com experiência em terapia intensiva. Focada em segurança do paciente.')
		expect(model.skills).toEqual([
			{ category: 'Assistência', items: ['SAE', 'Curativos'] },
			{ category: 'Competências', items: ['Pacote Office'] },
		])
		expect(model.experience).toEqual([
			{
				header: 'Hospital Exemplo Março 2021 - Presente Enfermeira Assistencial',
				bullets: ['Assistência a pacientes críticos.', 'Supervisão de técnicos.'],
			},
		])
		expect(model.projects).toEqual([
			{ name: 'Guia de cuidados', url: 'github.com/maria/guia', description: 'Material para pacientes.', technologies: ['Canva'] },
		])
		expect(model.otherSections).toEqual([
			{ title: 'Formação', text: 'Universidade Exemplo - Bacharelado em Enfermagem 2014 - 2018' },
			{ title: 'Certificações e Cursos', text: 'ACLS - 2023' },
			{ title: 'Idiomas', text: 'Inglês (intermediário); Espanhol.' },
		])
	})

	test('usa o preâmbulo do modelo neutro, com o nome no título do PDF, e o contato no cabeçalho', () => {
		const tex = latex(form)

		expect(tex).toStartWith('\\documentclass[a4paper,10pt]{article}')
		expect(tex).toContain('\\setmainfont{Nunito}')
		expect(tex).toContain('pdftitle={CV - Maria Souza}')
		expect(tex).toContain('pdfauthor={Maria Souza}')
		expect(tex).toContain('\\href{mailto:maria@example.com}{maria@example.com} \\ | \\ (11) 90000-0000')
		expect(tex).toContain('\\href{https://linkedin.com/in/maria/}{linkedin.com/in/maria}')
		expect(tex).toEndWith('\\end{document}\n')
	})

	test('escapa os caracteres especiais do LaTeX e mantém os acentos', () => {
		const special = 'Ação & 100% $50 #1 a_b {x} ~ ^ "c" \\'
		const tex = latex({
			contact: { ...contact, name: 'Ana $1 & Cia', links: ['exemplo.com/a b#x%'] },
			sections: [
				{ kind: 'summary', text: special },
				{ kind: 'experience', entries: [{ role: 'P&D', company: 'Empresa_X', period: '', bullets: [special, '[Destaque] 30%'] }] },
			],
		})
		const { model } = readResumeTex(tex)

		expect(tex).toContain(
			'Ação \\& 100\\% \\$50 \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textquotedbl{}c\\textquotedbl{} \\textbackslash{}',
		)
		expect(tex).toContain('pdftitle={CV - Ana \\$1 \\& Cia}')
		expect(tex).toContain('\\href{https://exemplo.com/a\\%20b\\#x\\%}{exemplo.com/a b\\#x\\%}')
		// Sem o `{}`, o `[...]` viraria o rótulo do item
		expect(tex).toContain('\\item {}[Destaque] 30\\%')
		expect(model.summary).toBe(special)
		expect(model.experience[0]!.bullets[0]).toBe(special)
	})

	test('seções e itens vazios ficam de fora', () => {
		const tex = latex({
			contact: { name: 'Maria', headline: '', location: '', email: '', phone: '', links: [''] },
			sections: [
				{ kind: 'summary', text: '  \n ' },
				{ kind: 'skills', groups: [{ category: 'Gestão', items: [] }] },
				{
					kind: 'experience',
					entries: [
						{ role: '', company: '', period: '', bullets: [] },
						{ role: 'Técnica', company: '', period: '2020', bullets: ['', 'Plantões.'] },
					],
				},
				{ kind: 'education', entries: [{ course: '', institution: '', period: '2010' }] },
				{ kind: 'certifications', entries: [] },
				{ kind: 'languages', entries: [{ language: '', level: 'fluente' }] },
				{ kind: 'projects', entries: [{ name: '', url: 'x.com', description: 'sem nome', technologies: [] }] },
			],
		})
		const { sections } = readResumeTex(tex)

		expect(Object.keys(sections)).toEqual(['experience'])
		expect(tex).toContain('\\textbf{Técnica} \\hfill 2020\n\n\\begin{itemize}[leftmargin=*]\n    \\item Plantões.\n\\end{itemize}')
		expect(tex).not.toContain('\\item \n')
		// O cabeçalho só com o nome: sem linhas vazias nem separadores soltos
		expect(tex).toContain('\\begin{center}\n    {\\LARGE \\textbf{Maria}}\n\\end{center}')
	})

	test('as seções saem na ordem do formulário', () => {
		const tex = latex({ contact, sections: [...form.sections].reverse() })
		const titles = [...tex.matchAll(/\\section\*\{([^}]*)\}/g)].map(match => match[1])

		expect(titles).toEqual([...CV_FORM_SECTIONS].reverse().map(kind => CV_FORM_DEFAULT_TITLES[kind]))
	})

	test('usa o título escrito na seção e o rótulo escolhido para as ferramentas dos projetos', () => {
		const tex = latex({
			contact,
			sections: [
				{ kind: 'skills', title: 'Habilidades Técnicas', groups: [{ category: 'IA & LLM', items: ['Ollama'] }] },
				{
					kind: 'projects',
					title: '',
					toolsLabel: 'Tecnologias',
					entries: [{ name: 'Jobs Scraper', url: '', description: 'Automação.', technologies: ['Bun'] }],
				},
				{ kind: 'education', title: 'Formação Acadêmica', entries: [{ course: 'ADS', institution: 'Unicesumar', period: '' }] },
			],
		})
		const { sections, model, raw } = readResumeTex(tex)

		expect(tex).toContain('\\section*{Habilidades Técnicas}')
		expect(tex).toContain('\\section*{Projetos}')
		expect(tex).toContain('\\section*{Formação Acadêmica}')
		expect(tex).toContain('\\textit{Tecnologias: Bun}')
		expect(Object.keys(sections)).toEqual(['skills', 'projects', 'education'])
		expect(model.projects[0]!.technologies).toEqual(['Bun'])
		expect(raw.projectSkillsLabel).toBe('Tecnologias')
	})

	test('o título próprio precisa ser um sinônimo da mesma seção', () => {
		expect(isSectionTitle('skills', 'Habilidades Técnicas')).toBe(true)
		expect(isSectionTitle('education', 'Formação Acadêmica')).toBe(true)
		expect(isSectionTitle('summary', 'Sobre mim')).toBe(true)
		expect(isSectionTitle('skills', '  ')).toBe(true)
		expect(isSectionTitle('skills', 'Experiência')).toBe(false)
		expect(isSectionTitle('education', 'Meus estudos')).toBe(false)
	})
})
