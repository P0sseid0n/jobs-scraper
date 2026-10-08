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
