import type { Ollama } from 'ollama'

import { checkPostLanguage, languageRejection, type LanguageCheck } from '@shared/language'

// Chamada separada da extração: dentro do prompt de extração, cheio de exemplos em português, o modelo de 4B
// respondia "pt" para "We're Hiring! Support Developer"; sozinho, acerta até textos que misturam os dois idiomas
const SYSTEM_PROMPT =
	'Identify the language the text is written in. Judge by its sentences and grammar words, not by job titles, ' +
	'technology names or hashtags, which are often in English. Answer with the ISO 639-1 code.'

const OUTPUT_FORMAT = { type: 'object', properties: { language: { type: 'string' } }, required: ['language'] }

/**
 * Idioma do post e motivo do descarte por idioma. Decide pelo detector de trigramas; com texto curto demais para
 * ele ("We're Hiring!", o post automático de "novo cargo"), pergunta ao modelo.
 */
export async function checkLanguage(ollama: Ollama, model: string, text: string, allowedLanguages: string[]): Promise<LanguageCheck> {
	const detected = checkPostLanguage(text, allowedLanguages)
	if (detected.language || allowedLanguages.length === 0) return detected

	// Erros do Ollama são transitórios: o QueueClient tenta de novo
	const response = await ollama.chat({
		model,
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: text.normalize('NFKC') },
		],
		format: OUTPUT_FORMAT,
		options: { temperature: 0 },
	})

	const language = parseLanguage(response.message.content)
	return { language, rejection: languageRejection(language, allowedLanguages) }
}

/** Código ISO 639-1 da resposta, sem a região ("pt-BR" → "pt"); resposta fora desse formato vira `null` (o post segue). */
export function parseLanguage(content: string): string | null {
	try {
		const { language } = JSON.parse(content) as { language?: unknown }
		if (typeof language !== 'string') return null
		return /^([a-z]{2})(?:[-_][a-z]+)?$/i.exec(language.trim())?.[1]?.toLowerCase() ?? null
	} catch {
		return null
	}
}
