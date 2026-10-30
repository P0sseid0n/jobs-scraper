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

/** Onde cada seção começa no PDF, pelo título (os sinônimos de `latex-syntax.ts`); as sem título não entram. */
function sectionPositions(text: string) {
	const positions = new Map<CvFormSectionKind, number>()

	text.split('\n').forEach((line, index) => {
		// Título é linha curta; uma frase que começa com "Experiência" não é
		const key = line.trim().length <= 60 ? sectionKey(line.trim()) : undefined
		if (key && !positions.has(key)) positions.set(key, index)
	})

	return positions
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
	const projects = keptEntries(check, output.projects)
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
	// Sem o título "Idiomas" no PDF, os idiomas do modelo são as linguagens de programação das habilidades
	const languages = sectionPositions(pdf.text).has('languages') ? keptEntries(check, output.languages) : []

	const sections: CvFormSection[] = [
		{ kind: 'summary', title: '', text: kept(check, output.summary) },
		{ kind: 'skills', title: '', groups: skills },
		{ kind: 'experience', title: '', entries: keptEntries(check, output.experience) },
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
