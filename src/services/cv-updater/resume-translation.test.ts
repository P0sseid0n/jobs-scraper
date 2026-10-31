import path from 'node:path'
import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { createLogger } from '@shared/logging'

import {
	renameSections,
	resumeLanguage,
	setBabelLanguage,
	splitLatexText,
	translateResume,
	translationProblem,
} from './resume-translation'
import { readResumeTex } from './resume/latex-reader'

const tex = await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text()
const parsed = readResumeTex(tex)
const log = createLogger('test')

/** Traduções de mentira: a IA recebe a lista de textos e devolve o que `translate` fizer com ela. */
function fakeOllama(translate: (texts: string[]) => string[] | Error) {
	const calls: string[][] = []
	const ollama = {
		chat: async (request: { messages: { content: string }[] }) => {
			const texts = JSON.parse(request.messages[1]!.content) as string[]
			calls.push(texts)
			const next = translate(texts)
			if (next instanceof Error) throw next
			return { message: { content: JSON.stringify({ texts: next }) } }
		},
	} as unknown as Ollama

	return { ollama, calls }
}

const WORDS: Record<string, string> = {
	'Linguagens:': 'Languages:',
	Ferramentas: 'Tools',
	'Integração com APIs REST e melhoria de performance.': 'REST API integration and performance improvements.',
	'Janeiro 2022 - Presente': 'January 2022 - Present',
	'- Análise e Desenvolvimento de Sistemas': '- Systems Analysis and Development',
}
const toEnglish = (texts: string[]) => texts.map(text => WORDS[text] ?? text)

describe('tradução do currículo base', () => {
	test('detecta o idioma do currículo', () => {
		expect(resumeLanguage(parsed.model)).toBe('pt')
	})

	test('no mesmo idioma, nada é pedido à IA', async () => {
		const { ollama, calls } = fakeOllama(toEnglish)

		expect(await translateResume({ ollama, model: 'm' }, parsed, 'pt-BR', log)).toBe(parsed)
		expect(calls).toEqual([])
	})

	test('em outro idioma: o texto, os títulos e o babel mudam; o LaTeX, o cabeçalho e os nomes dos projetos ficam', async () => {
		const { ollama, calls } = fakeOllama(toEnglish)
		const translated = await translateResume({ ollama, model: 'test-en' }, parsed, 'en', log)
		const headers = [...translated.tex.matchAll(/\\section\*\{([^}]*)\}/g)].map(match => match[1])

		expect(headers).toEqual(['Summary', 'Skills', 'Projects', 'Professional Experience', 'Education'])
		expect(translated.tex).toContain('\\usepackage[english]{babel}')
		expect(translated.tex).toContain('\\item \\textbf{Tools \\& DevOps:} Git, Docker')
		expect(translated.model.skills.map(group => group.category)).toContain('Languages')
		expect(translated.model.experience[0]?.bullets).toContain('REST API integration and performance improvements.')
		expect(translated.model.experience[0]?.header).toContain('January 2022 - Present')
		expect(translated.model.otherSections[0]?.text).toContain('Systems Analysis and Development')
		expect(Object.keys(translated.sections)).toEqual(Object.keys(parsed.sections))

		const sent = calls.flat()
		expect(sent).not.toContain('Loja Exemplo')
		expect(sent).not.toContain('Apresentação')
		expect(sent.some(text => text.includes('github.com') || text.includes('\\'))).toBe(false)
		const header = (text: string) => text.slice(0, text.indexOf('\\section*{'))
		expect(header(translated.tex)).toBe(header(tex).replace('[brazil]{babel}', '[english]{babel}'))
	})

	test('sem tradução (a IA falhou ou devolveu a lista errada), o texto fica e só os títulos mudam', async () => {
		for (const translate of [() => new Error('timeout'), (texts: string[]) => texts.slice(1)]) {
			const { ollama } = fakeOllama(translate)
			const translated = await translateResume({ ollama, model: 'test-broken' }, parsed, 'en', log)

			expect(translated.model.summary).toBe(parsed.model.summary)
			expect(translated.tex).toContain('\\section*{Professional Experience}')
		}
	})

	test('o mesmo currículo, no mesmo idioma e modelo, é traduzido uma vez só', async () => {
		const first = fakeOllama(toEnglish)
		const again = fakeOllama(toEnglish)
		const resume = readResumeTex(tex.replace('Scrum', 'Kanban'))

		await translateResume({ ollama: first.ollama, model: 'm' }, resume, 'en', log)
		await translateResume({ ollama: again.ollama, model: 'm' }, resume, 'en', log)

		expect(first.calls.length).toBeGreaterThan(0)
		expect(again.calls).toEqual([])
	})
})

describe('partes da tradução', () => {
	test('separa os textos do LaTeX sem perder nada', () => {
		const sample =
			'\\section*{Hobbies}\nCorrida e \\textbf{xadrez} \\hfill 2020\n\\href{https://x.dev}{x.dev} % nota\n\\vspace{6pt}\n\\textbf{Placar}'
		const pieces = splitLatexText(sample, new Set(['Placar']))

		expect(pieces.map(piece => piece.text).join('')).toBe(sample)
		expect(pieces.filter(piece => piece.translate).map(piece => piece.text.trim())).toEqual(['Hobbies', 'Corrida e', 'xadrez'])
	})

	test('o título de uma seção conhecida não é traduzido', () => {
		expect(
			splitLatexText('\\section*{Experiência}\nA')
				.filter(piece => piece.translate)
				.map(piece => piece.text.trim()),
		).toEqual(['A'])
	})

	test('troca só o título da primeira seção de cada tipo', () => {
		const sample = '\\section*{Experiência}\n\\section*{Projetos}\n\\section*{Experiência Profissional}'

		expect(renameSections(sample, { experience: 'Experience' })).toBe(
			'\\section*{Experience}\n\\section*{Projetos}\n\\section*{Experiência Profissional}',
		)
	})

	test('o babel passa ao idioma do currículo; sem idioma conhecido nele, fica', () => {
		expect(setBabelLanguage('\\usepackage[brazil]{babel}', 'en')).toBe('\\usepackage[english]{babel}')
		expect(setBabelLanguage('\\usepackage[english]{babel}', 'pt-BR')).toBe('\\usepackage[brazil]{babel}')
		expect(setBabelLanguage('\\usepackage[latin]{babel}', 'en')).toBe('\\usepackage[latin]{babel}')
	})

	test('recusa a lista com textos a menos, vazios ou cortados', () => {
		const original = ['Integração com APIs REST.', 'Desenvolvimento de interfaces.']

		expect(translationProblem(original, ['REST API integration.', 'Interface development.'])).toBeNull()
		expect(translationProblem(original, ['REST API integration. Interface development.'])).toContain('1 texts instead of 2')
		expect(translationProblem(original, ['REST API integration.', ' '])).toContain('text 2 is empty')
		expect(translationProblem(original, ['REST.', 'UI.'])).toContain('shorter')
	})
})
