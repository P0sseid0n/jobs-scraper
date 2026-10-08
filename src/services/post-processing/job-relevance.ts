import type { ProcessedJob } from '@shared/contracts'

type KeywordFilter = { requiredKeywords: string[]; excludedKeywords: string[] }

/**
 * Diz por que a vaga não interessa (palavras-chave das configurações), ou `null` se ela segue.
 * Olha só o cargo e os conhecimentos: o texto do post cita outras áreas com frequência ("time de front e back").
 */
export function relevanceRejection(job: Pick<ProcessedJob, 'title' | 'necessary_knowledge'>, filter: KeywordFilter) {
	const terms = searchableTerms([job.title ?? '', ...(job.necessary_knowledge ?? [])].join(' '))

	const excluded = filter.excludedKeywords.find(keyword => matchesKeyword(terms, keyword))
	if (excluded) return `cita "${excluded}", que está nas palavras excluídas`

	const required = filter.requiredKeywords
	if (required.length > 0 && !required.some(keyword => matchesKeyword(terms, keyword))) {
		return `não cita nenhuma das palavras obrigatórias (${required.join(', ')})`
	}

	return null
}

/**
 * Palavra a palavra, sem prefixo: "java" não casa com "javascript". Ignora caixa, acentos, hífen e ".js"
 * ("Vue.js" = "vue", "Front-end" = "frontend"), e "front end" separado também casa com "frontend".
 */
function matchesKeyword(terms: Set<string>, keyword: string) {
	return keywordForms(keyword).some(form => terms.has(form))
}

/** As palavras do texto, os pares vizinhos juntos ("front end" → "frontend") e as sequências de até 3 palavras. */
function searchableTerms(text: string) {
	const words = tokenize(text)
	const terms = new Set(words)

	for (let index = 0; index < words.length; index++) {
		const pair = words.slice(index, index + 2)
		const triple = words.slice(index, index + 3)

		if (pair.length === 2) terms.add(pair.join('')).add(pair.join(' '))
		if (triple.length === 3) terms.add(triple.join(' '))
	}

	return terms
}

function keywordForms(keyword: string) {
	const words = tokenize(keyword)

	return [words.join(' '), words.join('')].filter(Boolean)
}

function tokenize(text: string) {
	return text
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\.js\b/g, '')
		.replace(/(?<=[a-z0-9])[-_.](?=[a-z0-9])/g, '')
		.split(/[^a-z0-9#+]+/)
		.map(word => word.replace(/(?<=.{3})js$/, ''))
		.filter(Boolean)
}
