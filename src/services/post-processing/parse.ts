import { jsonrepair } from 'jsonrepair'
import { type AiJobOutput, AiJobOutputSchema } from '../../types/messages'

/**
 * Converte a resposta do modelo em uma vaga. Retorna `null` quando o modelo indica que o post não é uma vaga.
 * Lança erro se a resposta não puder ser interpretada como JSON.
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
