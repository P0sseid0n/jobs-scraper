import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import { cvSectionTitles } from '@shared/contracts'
import { languageName, localeForLanguage, type Locale } from '@shared/i18n'
import { checkPostLanguage } from '@shared/language'
import type { Logger } from '@shared/logging'

import { readResumeTex } from './resume/latex-reader'
import { escapeLatex, sectionKey, type SectionKey } from './resume/latex-syntax'
import type { ParsedResume, ResumeContent } from './resume/resume.types'

/**
 * O currículo da vaga em outro idioma: antes do ajuste, o currículo base inteiro é traduzido, os títulos das seções
 * conhecidas viram os do idioma e o `babel` passa a hifenizar nele. O ajuste segue igual sobre o currículo traduzido.
 *
 * A IA não vê o LaTeX: o código separa os textos dos comandos, a IA traduz só a lista de textos e o `.tex` é remontado
 * com os mesmos comandos (pedir o LaTeX traduzido inteiro a um modelo pequeno quebrava os comandos quase sempre). O
 * cabeçalho (nome e contatos) fica como está.
 */

const MODEL_ATTEMPTS = 2
/** Textos por pedido: com muitos de uma vez, modelos pequenos pulam ou juntam itens. */
const BATCH_SIZE = 40
/** A lista de textos e a tradução passam do contexto padrão do Ollama (4096 tokens) num currículo longo. */
const CONTEXT_TOKENS = 8192
/** Currículos traduzidos guardados (cada versão do currículo base em cada idioma): traduzir leva alguns segundos. */
const CACHE_SIZE = 8

/** O idioma de cada `Locale` no `\usepackage[...]{babel}`. */
const BABEL_NAMES: Record<Locale, string> = { 'pt-BR': 'brazil', en: 'english' }
const BABEL_PACKAGE = /\\usepackage\[([^\]]*)\]\{babel\}/
const BABEL_LANGUAGE = /\b(brazil|brazilian|portuguese|portuges|english|american|british|USenglish|UKenglish)\b/

type AiOptions = { ollama: Ollama; model: string }

/** O idioma (ISO 639-1) em que o currículo está escrito, detectado no texto, ou `null` se não der para saber. */
export function resumeLanguage(cv: ResumeContent) {
	return checkPostLanguage(cv.fullText, []).language
}

const cache = new Map<string, ParsedResume>()

/**
 * O currículo base no idioma `locale`. Volta o próprio `parsed` quando ele já está nesse idioma ou quando não dá para
 * saber em que idioma ele está. Se a IA não traduzir (falhou ou devolveu a lista errada), o texto fica no idioma
 * original e só os títulos e o `babel` mudam.
 */
export async function translateResume(ai: AiOptions, parsed: ParsedResume, locale: Locale, log: Logger): Promise<ParsedResume> {
	const from = resumeLanguage(parsed.model)
	if (!from || localeForLanguage(from) === locale) return parsed

	const key = `${ai.model}:${locale}:${Bun.hash(parsed.tex)}`
	const cached = cache.get(key)
	if (cached) return cached

	// Os títulos conhecidos já no idioma (não vão para a IA); o cabeçalho, antes da primeira seção, não muda
	const renamed = renameSections(parsed.tex, cvSectionTitles(locale))
	const start = renamed.search(/\\section\*?\{/)
	const end = renamed.indexOf('\\end{document}')
	const projectNames = new Set(parsed.model.projects.map(project => project.name))
	const pieces = start === -1 ? [] : splitLatexText(renamed.slice(start, end === -1 ? undefined : end), projectNames)
	const texts = pieces.filter(piece => piece.translate).map(piece => piece.text.trim().replace(/\s+/g, ' '))

	const translated = await translateTexts(ai, texts, languageName(from, 'en'), languageName(locale, 'en'), log)
	let tex = renamed
	if (translated) {
		let next = 0
		const body = pieces.map(piece => (piece.translate ? withSpacing(piece.text, escapeLatex(translated[next++]!)) : piece.text))
		tex = renamed.slice(0, start) + body.join('') + (end === -1 ? '' : renamed.slice(end))
	}

	const result = readResumeTex(setBabelLanguage(tex, locale))
	log.info({ from, to: locale, texts: texts.length, translated: !!translated }, 'Currículo base traduzido')

	// Sem a tradução, a próxima vaga tenta de novo
	if (translated) {
		cache.set(key, result)
		if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!)
	}
	return result
}

/** Um pedaço do `.tex`: um texto a traduzir ou LaTeX (comandos, chaves, argumentos técnicos), que fica igual. */
export type LatexPiece = { text: string; translate: boolean }

/**
 * Comandos e o que nunca se traduz: ambientes com as opções, o primeiro argumento de links e espaçamentos, os demais
 * comandos com as opções, os caracteres escapados, as chaves, os comentários e os caracteres especiais soltos.
 */
const LATEX_TOKEN =
	/\\section\*?\{[^}]*\}|\\(?:begin|end)\{[^}]*\}(?:\[[^\]]*\])?|\\(?:href|url|vspace|hspace|includegraphics|label|ref)\*?(?:\[[^\]]*\])?\{[^}]*\}|\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?|\\[\s\S]|[{}]|%[^\n]*|[&~$^_#]/g

const SECTION_TITLE = /^(\\section\*?\{)([^}]*)\}$/

/** Um texto que é link, e-mail ou domínio ("github.com/fulano/loja"): não se traduz. */
const ADDRESS = /^\S*(?:@|\/|www\.|\.(?:com|dev|io|br|org|net|me|app)\b)\S*$/i

/**
 * Separa o `.tex` em textos a traduzir e LaTeX; juntar os `text` devolve o `.tex` original. Os textos de `keep` (os
 * nomes dos projetos, que ligam o projeto ao repositório do GitHub) ficam como estão.
 */
export function splitLatexText(latex: string, keep: ReadonlySet<string> = new Set()): LatexPiece[] {
	const pieces: LatexPiece[] = []
	let last = 0

	const pushText = (text: string) => {
		if (!text) return
		const trimmed = text.trim()
		pieces.push({ text, translate: /\p{L}/u.test(trimmed) && !ADDRESS.test(trimmed) && !keep.has(trimmed) })
	}

	for (const match of latex.matchAll(LATEX_TOKEN)) {
		pushText(latex.slice(last, match.index))
		const title = match[0].match(SECTION_TITLE)
		// O título de uma seção que o leitor não conhece é traduzido; o das conhecidas já está no idioma
		if (title && !sectionKey(title[2]!)) {
			pieces.push({ text: title[1]!, translate: false })
			pushText(title[2]!)
			pieces.push({ text: '}', translate: false })
		} else pieces.push({ text: match[0], translate: false })
		last = match.index + match[0].length
	}
	pushText(latex.slice(last))

	return pieces
}

/** A tradução com os espaços e quebras de linha do texto original em volta (eles separam o texto dos comandos). */
function withSpacing(original: string, translated: string) {
	const lead = original.match(/^\s*/)![0]
	const trail = original.slice(lead.length).match(/\s*$/)![0]
	return `${lead}${translated}${trail}`
}

const systemPrompt = (from: string, to: string) => `You translate the texts of a résumé from ${from} to ${to}.
You get a JSON array of texts, in the order they appear in the résumé. Return JSON with "texts": the translations, one for each text, in the same order (the same number of items).
- Never translate names of people, companies, schools, universities, products, projects, technologies, tools or programming languages.
- Translate job titles, descriptions, degrees, course names, language levels, month names and words like "Atual" or "Presente" ("Present") and "Tecnologias" ("Technologies").
- Keep the punctuation at the start and end of each text (a text can be part of a sentence, like "Ferramentas " before " DevOps").
- Do not merge, split, add or remove texts or facts.`

/** Traduz os textos em lotes; `null` se a IA falhar ou devolver uma lista que não serve em algum lote. */
async function translateTexts(ai: AiOptions, texts: string[], from: string, to: string, log: Logger) {
	const translated: string[] = []
	for (let index = 0; index < texts.length; index += BATCH_SIZE) {
		const batch = await translateBatch(ai, texts.slice(index, index + BATCH_SIZE), from, to, log)
		if (!batch) return null
		translated.push(...batch)
	}
	return translated
}

async function translateBatch(ai: AiOptions, texts: string[], from: string, to: string, log: Logger) {
	const schema = z.object({ texts: z.array(z.string()).length(texts.length) })
	const messages: Message[] = [
		{ role: 'system', content: systemPrompt(from, to) },
		{ role: 'user', content: JSON.stringify(texts) },
	]

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		let answer: string
		try {
			const response = await ai.ollama.chat({
				model: ai.model,
				messages,
				format: z.toJSONSchema(schema),
				options: { temperature: 0.1, num_ctx: CONTEXT_TOKENS },
			})
			answer = response.message.content
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA para traduzir o currículo; o texto fica no idioma original')
			return null
		}

		const translated = parseTexts(answer)
		const problem = translated === null ? 'invalid JSON' : translationProblem(texts, translated)
		if (!problem) return translated!.map(text => text.trim().replace(/\s+/g, ' '))

		log.info({ attempt, reason: problem }, 'Tradução do currículo recusada')
		messages.push(
			{ role: 'assistant', content: answer },
			{ role: 'user', content: `Your translation was rejected: ${problem}. Translate the texts again and return the JSON.` },
		)
	}

	log.warn('A IA não traduziu o currículo; o texto fica no idioma original')
	return null
}

function parseTexts(content: string) {
	try {
		return z.object({ texts: z.array(z.string()) }).parse(JSON.parse(content)).texts
	} catch {
		return null
	}
}

/**
 * Por que a tradução não serve (em inglês, para devolver ao modelo), ou `null`: uma tradução para cada texto, nenhuma
 * vazia, e o conjunto sem encolher nem crescer demais (textos pulados, juntados ou inventados).
 */
export function translationProblem(original: string[], translated: string[]): string | null {
	if (translated.length !== original.length) {
		return `it has ${translated.length} texts instead of ${original.length}: translate each text separately, in order`
	}

	const empty = translated.findIndex(text => !text.trim())
	if (empty !== -1) return `text ${empty + 1} is empty`

	const length = (texts: string[]) => texts.join('').length
	const ratio = length(translated) / Math.max(1, length(original))
	if (ratio < 0.5 || ratio > 2) return 'it is much shorter or longer than the original: translate all of it, and nothing more'

	return null
}

/** Troca o título das seções conhecidas (a primeira de cada, a mesma que o leitor usa) pelos de `titles`. */
export function renameSections(tex: string, titles: Partial<Record<SectionKey, string>>) {
	const renamed = new Set<SectionKey>()

	return tex.replace(/\\section(\*?)\{([^}]*)\}/g, (whole, star: string, title: string) => {
		const key = sectionKey(title)
		const next = key && !renamed.has(key) ? titles[key] : undefined
		if (key) renamed.add(key)

		return next ? `\\section${star}{${escapeLatex(next)}}` : whole
	})
}

/** Troca o idioma do `babel` pelo de `locale` (a hifenização e as palavras automáticas); sem `babel`, nada muda. */
export function setBabelLanguage(tex: string, locale: Locale) {
	return tex.replace(BABEL_PACKAGE, (whole, options: string) =>
		BABEL_LANGUAGE.test(options) ? `\\usepackage[${options.replace(BABEL_LANGUAGE, BABEL_NAMES[locale])}]{babel}` : whole,
	)
}
