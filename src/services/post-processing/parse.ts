import { jsonrepair } from 'jsonrepair'
import { type AiJobOutput, AiJobOutputSchema } from '../../types/messages'

/**
 * Converte a resposta do modelo em uma vaga. Retorna `null` se o modelo respondeu `null`
 * (formato antigo do prompt). Lança erro se a resposta não puder ser interpretada como JSON.
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

/** Motivo para descartar a resposta do modelo, ou `null` se ela é uma vaga válida. */
export function rejectionReason(job: AiJobOutput | null, minConfidence: number): string | null {
	if (!job) return 'modelo respondeu null'
	if (!job.isJob) return `modelo indicou que não é vaga (${job.postType ?? 'isJob=false'})`
	if (job.aiJobConfidence < minConfidence) return `confiança ${job.aiJobConfidence} abaixo do mínimo ${minConfidence}`
	return null
}

/** Só aceita o link extraído pela IA se ele estiver escrito no post (evita link inventado). */
export function linkFromText(link: string | null, text: string): string | null {
	if (!link || !/^https?:\/\//i.test(link)) return null
	return text.includes(link) ? link : null
}
