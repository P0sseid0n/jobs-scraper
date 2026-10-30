import {
	CV_FORM_SECTIONS,
	CV_FORM_TOOLS_LABELS,
	CvFormDraftSchema,
	type CvFormDraft,
	type CvFormSection,
	type CvFormSectionKind,
} from '@shared/contracts'

import { sectionKey } from '../resume/latex-syntax'
import type { ImportOutput } from './import-prompt'
import type { PdfText } from './pdf-text'

/**
 * Compara sem diferenciar maiúsculas, espaços, quebras de linha e o tipo de traço ou de aspas: o modelo copia "Março
 * 2021 – Presente" como "Março 2021 - Presente", e uma frase do PDF pode quebrar no meio.
 */
function normalize(text: string) {
	return text
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\u2010-\u2015\u2212]/g, '-')
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/^(?:https?:\/\/)?(?:www\.)?/, '')
		.replace(/\/$/, '')
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * O que o PDF tem escrito, para conferir cada campo devolvido pelo modelo: o texto (também sem as palavras hifenizadas
 * na quebra de linha, "desenvolvi-\nmento") e os links clicáveis.
 */
export function pdfCorpus(pdf: PdfText) {
	const unhyphenated = pdf.text.replace(/(\p{L})-\n(\p{L})/gu, '$1$2')
	const texts = [pdf.text, unhyphenated, ...pdf.links].map(text => normalize(text.replace(/https?:\/\/(?:www\.)?/gi, '')))

	return (value: string) => {
		const needle = normalize(value)
		return needle !== '' && texts.some(text => text.includes(needle))
	}
}

type Corpus = ReturnType<typeof pdfCorpus>

/**
 * A seção de que a linha é o título (os sinônimos de `latex-syntax.ts`). Título é linha curta: uma frase que começa
 * com "Experiência" não é.
 */
const headingKey = (line: string) => (line.trim().length <= 60 ? sectionKey(line.trim()) : undefined)

/** Onde cada seção começa no PDF, pelo título; as sem título não entram. */
function sectionPositions(text: string) {
	const positions = new Map<CvFormSectionKind, number>()

	text.split('\n').forEach((line, index) => {
		const key = headingKey(line)
		if (key && !positions.has(key)) positions.set(key, index)
	})

	return positions
}

/** Marcador de item no começo da linha ("• ", "- "). */
const BULLET = /^\s*[•·▪◦‣*\-–]\s+/
const SENTENCE_END = /[.!?;:]$/

/** Junta as linhas de um trecho do PDF: a palavra hifenizada na quebra ("Com-" + "prometido") volta a ser uma só. */
function joinLines(lines: string[]) {
	return lines.reduce((text, line) => (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line) ? text.slice(0, -1) + line : `${text} ${line}`))
}

/** As linhas do PDF sem o marcador de item, e as originais (para reconhecer títulos e marcadores). */
function pdfLines(text: string) {
	const raw = text.split('\n')
	return { raw, lines: raw.map(line => line.replace(BULLET, '').trim()) }
}

/**
 * O tópico ou a descrição inteira quando o modelo copiou só as primeiras linhas: o valor que termina no fim de uma
 * linha do PDF continua nas seguintes enquanto a frase não terminou e a linha seguinte não começa outro item ou seção.
 * O que entra sai do PDF, não do modelo.
 */
export function completeFromPdf(value: string, text: string) {
	const target = normalize(value)
	if (!target) return value

	const { raw, lines } = pdfLines(text)
	const covers = (start: number, end: number) => normalize(joinLines(lines.slice(start, end + 1)))

	for (let start = 0; start < lines.length; start++) {
		if (!lines[start] || !target.startsWith(normalize(lines[start]!))) continue

		// As linhas do PDF que formam o valor, até a última que ele copiou inteira
		let end = start
		while (covers(start, end) !== target && end + 1 < lines.length && target.startsWith(covers(start, end + 1))) end++
		if (covers(start, end) !== target) continue

		const continues = (index: number) =>
			!!lines[index] && !headingKey(raw[index]!) && !BULLET.test(raw[index]!) && !SENTENCE_END.test(lines[index - 1]!)
		while (end + 1 < lines.length && continues(end + 1)) end++

		return joinLines(lines.slice(start, end + 1))
	}

	return value
}

/**
 * A apresentação copiada do PDF: do começo dela, achado pela primeira frase do que o modelo devolveu, até o próximo
 * título. O modelo cortava o parágrafo na primeira quebra de linha ou, pedindo tudo, errava uma palavra hifenizada
 * ("Com-" + "prometido" virou "Prometido"); assim, o texto todo sai do PDF.
 * @returns Vazio se a primeira frase não começa uma linha do PDF.
 */
export function paragraphFromPdf(value: string, text: string) {
	const first = normalize(value.split(/(?<=[.!?])\s+|\n/)[0] ?? '')
	if (!first) return ''

	const { raw, lines } = pdfLines(text)

	for (let start = 0; start < lines.length; start++) {
		const line = normalize(lines[start]!)
		if (!line || !(line.startsWith(first) || first.startsWith(line)) || headingKey(raw[start]!)) continue

		let end = start
		while (end + 1 < lines.length && lines[end + 1] && !headingKey(raw[end + 1]!) && !BULLET.test(raw[end + 1]!)) end++

		// A linha pode só começar como a frase (o cargo "Desenvolvedor Full-Stack" no topo): vale a que forma a frase toda
		const paragraph = joinLines(lines.slice(start, end + 1))
		if (normalize(paragraph).startsWith(first)) return paragraph
	}

	return ''
}

/**
 * As seções na ordem do PDF. A apresentação sem título fica em primeiro (é o parágrafo do topo); as outras sem título
 * vão para o fim, na ordem padrão.
 */
function orderSections(sections: CvFormSection[], text: string) {
	const positions = sectionPositions(text)
	const rank = (kind: CvFormSectionKind) => positions.get(kind) ?? (kind === 'summary' ? -1 : Number.POSITIVE_INFINITY)

	return sections.sort((a, b) => rank(a.kind) - rank(b.kind) || CV_FORM_SECTIONS.indexOf(a.kind) - CV_FORM_SECTIONS.indexOf(b.kind))
}

/** O valor, se ele está escrito no PDF; senão, vazio (o modelo inventou, traduziu ou reescreveu). */
const kept = (corpus: Corpus, value: string) => (corpus(value) ? value.trim() : '')
const keptAll = (corpus: Corpus, values: string[]) => values.map(value => kept(corpus, value)).filter(Boolean)

/** Os campos de texto do item, cada um conferido no PDF; o item some se nenhum ficar. */
function keptEntries<T extends Record<string, string | string[]>>(corpus: Corpus, entries: T[]): T[] {
	return entries
		.map(
			entry =>
				Object.fromEntries(
					Object.entries(entry).map(([key, value]) => [key, Array.isArray(value) ? keptAll(corpus, value) : kept(corpus, value)]),
				) as T,
		)
		.filter(entry => Object.values(entry).some(value => value.length > 0))
}

/**
 * Corta os textos e as listas acima dos limites do formulário (o PDF pode ter mais tópicos do que cabem): cortar não
 * inventa nada, e a pessoa revisa antes de salvar.
 */
function fitLimits(draft: CvFormDraft): CvFormDraft {
	const result = CvFormDraftSchema.safeParse(draft)
	if (result.success) return result.data

	const copy = structuredClone(draft) as unknown as Record<PropertyKey, unknown>
	for (const issue of result.error.issues) {
		if (issue.code !== 'too_big') throw result.error

		const key = issue.path.at(-1)!
		const parent = issue.path.slice(0, -1).reduce<Record<PropertyKey, unknown>>((node, part) => node[part] as never, copy)
		parent[key] = (parent[key] as string | unknown[]).slice(0, Number(issue.maximum))
	}

	return CvFormDraftSchema.parse(copy)
}

/**
 * Monta o formulário com a resposta do modelo, ficando só o que está escrito no PDF: o campo que o modelo inventou,
 * traduziu ou reescreveu fica vazio. Seções vazias não entram; as outras seguem a ordem do PDF.
 * @returns O formulário e quantos campos foram descartados (para o log).
 */
export function importedForm(output: ImportOutput, pdf: PdfText): { form: CvFormDraft; dropped: number } {
	const corpus = pdfCorpus(pdf)
	let dropped = 0
	const check: Corpus = value => {
		const found = corpus(value)
		if (!found && value.trim()) dropped++
		return found
	}

	const skills = output.skills
		.map(group => ({ category: kept(check, group.category), items: keptAll(check, group.items) }))
		.filter(group => group.items.length > 0)
	const projects = keptEntries(check, output.projects).map(project => ({
		...project,
		description: completeFromPdf(project.description, pdf.text),
	}))
	const experience = keptEntries(check, output.experience).map(entry => ({
		...entry,
		bullets: entry.bullets.map(bullet => completeFromPdf(bullet, pdf.text)),
	}))
	const projectUrls = new Set(projects.map(project => normalize(project.url)).filter(Boolean))

	const contact = {
		name: kept(check, output.contact.name),
		headline: kept(check, output.contact.headline),
		location: kept(check, output.contact.location),
		email: kept(check, output.contact.email),
		phone: kept(check, output.contact.phone),
		// Os links clicáveis vão todos ao modelo, e ele costuma pôr os dos projetos também no contato
		links: [...new Set(keptAll(check, output.contact.links))].filter(link => !projectUrls.has(normalize(link))),
	}
	const summary = paragraphFromPdf(output.summary, pdf.text)
	if (!summary && output.summary.trim()) dropped++
	// Sem o título "Idiomas" no PDF, os idiomas do modelo são as linguagens de programação das habilidades
	const languages = sectionPositions(pdf.text).has('languages') ? keptEntries(check, output.languages) : []

	const sections: CvFormSection[] = [
		{ kind: 'summary', title: '', text: summary },
		{ kind: 'skills', title: '', groups: skills },
		{ kind: 'experience', title: '', entries: experience },
		{ kind: 'education', title: '', entries: keptEntries(check, output.education) },
		{ kind: 'certifications', title: '', entries: keptEntries(check, output.certifications) },
		{ kind: 'languages', title: '', entries: languages },
		{ kind: 'projects', title: '', entries: projects, toolsLabel: toolsLabel(pdf.text) },
	]

	const filled = sections.filter(section => {
		if (section.kind === 'summary') return section.text !== ''
		return ('groups' in section ? section.groups : section.entries).length > 0
	})

	return { form: fitLimits({ contact, sections: orderSections(filled, pdf.text) }), dropped }
}

/** O rótulo das ferramentas dos projetos como está no PDF ("Tecnologias: ..."); sem nenhum, o padrão. */
function toolsLabel(text: string) {
	return CV_FORM_TOOLS_LABELS.find(label => new RegExp(`^\\s*${label}:`, 'im').test(text)) ?? CV_FORM_TOOLS_LABELS[0]
}
