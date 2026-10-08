import { jsonrepair } from 'jsonrepair'

import { AiJobOutputSchema, type AiJobOutput } from './extraction-output'

/**
 * Converte a resposta do modelo numa vaga, reparando JSON malformado.
 * @returns A vaga, ou `null` se o modelo respondeu `null` (formato antigo do prompt).
 * @throws Se a resposta não for um objeto JSON.
 */
export function parseModelResponse(content: string): AiJobOutput | null {
	const repaired = jsonrepair(content.trim())
	const parsed: unknown = JSON.parse(repaired)

	if (parsed === null) return null
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Resposta do modelo não é um objeto JSON: ${repaired.slice(0, 100)}`)
	}

	return AiJobOutputSchema.parse(parsed)
}

/** Diz por que descartar a resposta do modelo, ou `null` se ela for uma vaga válida. */
export function rejectionReason(job: AiJobOutput | null, minConfidence: number): string | null {
	if (!job) return 'modelo respondeu null'
	if (!job.isJob) return `modelo indicou que não é vaga (${job.postType ?? 'isJob=false'})`
	if (job.aiJobConfidence < minConfidence) return `confiança ${job.aiJobConfidence} abaixo do mínimo ${minConfidence}`
	return null
}

/** Mantém o link da IA só se ele estiver escrito no post (evita link inventado). */
export function keepLinkIfInPost(link: string | null, text: string): string | null {
	if (!link || !/^https?:\/\//i.test(link)) return null
	return text.includes(link) ? link : null
}

/**
 * Mantém só os conhecimentos escritos no post (evita tecnologia inventada): cada palavra do item precisa
 * começar alguma palavra do texto, ignorando caixa, acentos, ".js" e plural ("REST APIs" ↔ "API REST").
 * @returns Os conhecimentos encontrados, ou `null` se nenhum sobrar.
 */
export function keepSkillsInPost(skills: string[] | null, text: string): string[] | null {
	const normalizedText = normalizeForMatch(text)
	const kept = (skills ?? []).filter(skill => skillWords(skill).every(word => containsWordStart(normalizedText, word)))

	return kept.length > 0 ? kept : null
}

function skillWords(skill: string) {
	return normalizeForMatch(skill)
		.replace(/\.js\b/g, '')
		.split(/[^a-z0-9#+]+/)
		.filter(Boolean)
		.map(word => word.replace(/(?<=.{3})js$/, '').replace(/(?<=.{3})s$/, ''))
}

/** Palavras de até 2 caracteres ("C", "R", "Go", "AI") precisam aparecer inteiras; as demais, no começo de uma palavra. */
function containsWordStart(text: string, word: string) {
	const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const end = word.length <= 2 ? '(?![a-z0-9#+])' : ''

	return new RegExp(`(?<![a-z0-9])${escaped}${end}`).test(text)
}

function normalizeForMatch(text: string) {
	return text
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
}
