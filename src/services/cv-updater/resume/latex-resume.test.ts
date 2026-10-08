import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { readResumeTex } from './latex-reader'
import { writeResumeTex } from './latex-writer'
import type { TailoredResume } from './resume.types'

const tex = await Bun.file(path.join(import.meta.dir, '../assets/cv.example.tex')).text()

const parsed = readResumeTex(tex)

const { fullText: _fullText, ...identity }: TailoredResume & { fullText: string } = parsed.model

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
