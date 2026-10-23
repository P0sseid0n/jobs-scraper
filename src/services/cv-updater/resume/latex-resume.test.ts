import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './latex-reader'
import { writeResumeTex } from './latex-writer'
import type { ResumeContent, TailoredResume } from './resume.types'

const tex = await Bun.file(path.join(import.meta.dir, '../assets/cv.example.tex')).text()

const parsed = readResumeTex(tex)
const neutralTex = await Bun.file(path.join(import.meta.dir, '../assets/cv.neutral.example.tex')).text()

const { fullText: _fullText, otherSections: _otherSections, ...identity }: ResumeContent = parsed.model

describe('readResumeTex', () => {
	test('extrai as seções em texto puro', () => {
		const { model } = parsed
		expect(model.summary).toBe(
			'Desenvolvedor Full-Stack com experiência em TypeScript, Vue.js e Node.js. Focado em interfaces performáticas, boas práticas e qualidade de código.',
		)
		expect(model.skills.map(group => group.category)).toEqual(['Front-end', 'Back-end', 'Linguagens', 'Ferramentas & DevOps'])
		expect(model.skills[0]?.items).toEqual(['HTML', 'CSS (SASS/SCSS)', 'Vue.js', 'React'])
		expect(model.projects.map(project => project.name)).toEqual(['Loja Exemplo', 'Painel Exemplo'])
		expect(model.projects[1]?.technologies).toEqual(['Vue.js', 'TypeScript'])
		expect(model.experience[0]?.header).toBe('Empresa Exemplo Janeiro 2022 - Presente Desenvolvedor Front-End')
		expect(model.experience[0]?.bullets).toHaveLength(3)
		expect(model.fullText).toContain('Universidade Exemplo')
	})
})

describe('writeResumeTex', () => {
	test('sem ajustes, o .tex gerado é idêntico ao original', () => {
		expect(writeResumeTex(parsed, identity)).toBe(tex)
	})

	test('troca só os trechos ajustados, mantendo o resto do arquivo', () => {
		const tailored: TailoredResume = {
			...identity,
			summary: 'Front-end com Vue.js & TypeScript, 100% focado em performance.',
			skills: [
				{ category: 'Linguagens', items: ['JavaScript / TypeScript', 'Python'] },
				{ category: 'Front-end', items: ['Vue.js', 'HTML', 'CSS (SASS/SCSS)', 'React'] },
				...identity.skills.filter(group => !['Linguagens', 'Front-end'].includes(group.category)),
			],
			projects: [...identity.projects].reverse(),
			experience: [{ ...identity.experience[0]!, bullets: [...identity.experience[0]!.bullets].reverse() }],
		}
		const out = writeResumeTex(parsed, tailored)

		expect(out).toContain(
			'\\section*{Apresentação}\nFront-end com Vue.js \\& TypeScript, 100\\% focado em performance.\n\n\\section*',
		)
		expect(out).toContain(
			'    \\item \\textbf{Linguagens:} JavaScript / TypeScript, Python\n    \\item \\textbf{Front-end:} Vue.js, HTML, CSS (SASS/SCSS), React',
		)
		expect(out).toContain('\\item \\textbf{Ferramentas \\& DevOps:} Git, Docker')
		// Sem destaque: nenhum item de habilidade ganha negrito
		expect(out).not.toContain('\\textbf{Vue.js}')
		expect(out.indexOf('\\textbf{Painel Exemplo}')).toBeLessThan(out.indexOf('\\textbf{Loja Exemplo}'))
		expect(out).toContain(
			'    \\item Participação em cerimônias ágeis (Scrum).\n    \\item Desenvolvimento de interfaces com Vue.js e TypeScript.\n    \\item Integração com APIs REST e melhoria de performance.\n\\end{itemize}',
		)
		// Preâmbulo, cabeçalho e formação ficam intactos
		expect(out.slice(0, out.indexOf('\\section*'))).toBe(tex.slice(0, tex.indexOf('\\section*')))
		expect(out.slice(out.indexOf('\\section*{Formação'))).toBe(tex.slice(tex.indexOf('\\section*{Formação')))
		// O resultado continua legível pelo próprio parser
		expect(readResumeTex(out).model.summary).toBe(tailored.summary)
	})
})

describe('writeResumeTex com projetos novos', () => {
	test('projeto novo fica em parágrafo próprio, separado pelo mesmo \\vspace do original', () => {
		const out = writeResumeTex(parsed, {
			...identity,
			projects: [
				identity.projects[0]!,
				{ name: 'Novo', url: 'github.com/fulano/novo', description: 'Projeto novo.', technologies: ['Vue.js'] },
			],
		})

		expect(out).toContain(
			'\\textit{Tecnologias: React, Node.js, PostgreSQL}\n\n\\vspace{6pt}\n\n\\textbf{Novo} | \\href{https://github.com/fulano/novo}{github.com/fulano/novo}',
		)
		expect(readResumeTex(out).model.projects.map(project => project.name)).toEqual(['Loja Exemplo', 'Novo'])
	})
})

describe('writeResumeTex com habilidades adicionadas e removidas', () => {
	test('remove linhas de categorias vazias e escreve itens novos', () => {
		const out = writeResumeTex(parsed, {
			...identity,
			skills: [{ category: 'Front-end', items: ['Vue.js', 'C# & .NET'] }],
		})

		expect(out).toContain(
			'\\begin{itemize}[leftmargin=*, itemsep=4pt]\n    \\item \\textbf{Front-end:} Vue.js, C\\# \\& .NET\n\\end{itemize}',
		)
		expect(out).not.toContain('Back-end:')
		expect(readResumeTex(out).model.skills).toEqual([{ category: 'Front-end', items: ['Vue.js', 'C# & .NET'] }])
	})
})

describe('currículo de outra área (cv.neutral.example.tex)', () => {
	const neutral = readResumeTex(neutralTex)
	const { fullText: _neutralText, otherSections: _otherSections, ...neutralIdentity } = neutral.model

	test('lê as seções pelos sinônimos, sem projetos', () => {
		const { model } = neutral
		expect(Object.keys(neutral.sections).sort()).toEqual([
			'certifications',
			'education',
			'experience',
			'languages',
			'skills',
			'summary',
		])
		expect(model.summary).toStartWith('Enfermeira com experiência em clínica médica')
		expect(model.skills.map(group => group.category)).toEqual(['Assistência', 'Terapia intensiva', 'Gestão', 'Sistemas'])
		expect(model.skills[0]?.items).toEqual([
			'Sistematização da Assistência de Enfermagem (SAE)',
			'administração de medicamentos',
			'curativos',
		])
		expect(model.projects).toEqual([])
		expect(model.experience.map(entry => entry.bullets.length)).toEqual([3, 2])
	})

	test('formação, certificações e idiomas ficam no texto que a IA lê, com o título do .tex', () => {
		expect(neutral.model.otherSections.map(section => section.title)).toEqual(['Formação', 'Certificações e Cursos', 'Idiomas'])
		expect(neutral.model.otherSections[0]?.text).toContain('Bacharelado em Enfermagem')
		expect(neutral.model.otherSections[1]?.text).toContain('ACLS')
	})

	test('sem ajustes, o .tex gerado é idêntico; com ajustes, formação e o resto ficam intactos', () => {
		expect(writeResumeTex(neutral, neutralIdentity)).toBe(neutralTex)

		const out = writeResumeTex(neutral, {
			...neutralIdentity,
			summary: 'Enfermeira intensivista com foco em segurança do paciente.',
			skills: [...neutralIdentity.skills].reverse(),
			experience: neutralIdentity.experience.map(entry => ({ ...entry, bullets: [...entry.bullets].reverse() })),
		})

		expect(out).toContain('\\section*{Resumo}\nEnfermeira intensivista com foco em segurança do paciente.\n\n\\section*')
		expect(out.indexOf('\\textbf{Sistemas:}')).toBeLessThan(out.indexOf('\\textbf{Assistência:}'))
		expect(out.slice(out.indexOf('\\section*{Formação}'))).toBe(neutralTex.slice(neutralTex.indexOf('\\section*{Formação}')))
	})
})

describe('títulos das seções', () => {
	const sectionsOf = (...titles: string[]) =>
		Object.keys(
			readResumeTex(`\\begin{document}\n${titles.map(title => `\\section*{${title}}\ntexto\n`).join('')}\\end{document}`).sections,
		)

	test('aceita sinônimos em português e em inglês, sem diferenciar acentos nem maiúsculas', () => {
		expect(sectionsOf('Sobre mim', 'Competências', 'Portfólio', 'Experiência', 'Formação Acadêmica')).toEqual([
			'summary',
			'skills',
			'projects',
			'experience',
			'education',
		])
		expect(sectionsOf('Professional Summary', 'SKILLS', 'Portfolio', 'Work Experience', 'Education', 'Languages')).toEqual([
			'summary',
			'skills',
			'projects',
			'experience',
			'education',
			'languages',
		])
		expect(sectionsOf('Resumo:', 'experiencia profissional')).toEqual(['summary', 'experience'])
	})

	test('títulos compostos valem se todas as partes forem da mesma seção', () => {
		expect(sectionsOf('Certificações/Cursos')).toEqual(['certifications'])
		expect(sectionsOf('Cursos e Certificações')).toEqual(['certifications'])
		expect(sectionsOf('Licenses \\& Certifications')).toEqual(['certifications'])
		expect(sectionsOf('Formação e Experiência')).toEqual([])
	})

	test('títulos desconhecidos são mantidos como estão; uma seção repetida vale na primeira vez', () => {
		const parsed = readResumeTex(
			'\\begin{document}\n\\section*{Resumo}\nprimeiro\n\\section*{Sobre}\nsegundo\n\\section*{Hobbies}\nx\n\\end{document}',
		)
		expect(Object.keys(parsed.sections)).toEqual(['summary'])
		expect(parsed.model.summary).toBe('primeiro')
	})
})

describe('rótulo das tecnologias dos projetos', () => {
	test('aceita "Ferramentas:" e "Competências:", e os projetos novos repetem o rótulo do .tex', () => {
		const withTools = tex.replaceAll('\\textit{Tecnologias:', '\\textit{Ferramentas:')
		const toolsParsed = readResumeTex(withTools)
		expect(toolsParsed.model.projects[1]?.technologies).toEqual(['Vue.js', 'TypeScript'])
		expect(toolsParsed.model.projects[1]?.description).toBe('Painel administrativo com gráficos em tempo real.')

		const out = writeResumeTex(toolsParsed, {
			...identity,
			projects: [{ name: 'Novo', description: 'Projeto novo.', technologies: ['Vue.js'] }],
		})
		expect(out).toContain('\\textbf{Novo}\n\nProjeto novo.\n\n\\textit{Ferramentas: Vue.js}')

		const withSkills = readResumeTex(tex.replace('\\textit{Tecnologias:', '\\textit{Competências:'))
		expect(withSkills.model.projects[0]?.technologies).toEqual(['React', 'Node.js', 'PostgreSQL'])
	})
})
