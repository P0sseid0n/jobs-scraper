import { francAll } from 'franc-min'

/** Idiomas que o detector distingue (ISO 639-3 do franc → ISO 639-1 usado nas configurações). */
const LANGUAGE_CODES: Record<string, string> = {
	por: 'pt',
	eng: 'en',
	spa: 'es',
	fra: 'fr',
	ita: 'it',
	deu: 'de',
	nld: 'nl',
	pol: 'pl',
	rus: 'ru',
	tur: 'tr',
	ind: 'id',
	vie: 'vi',
}

// Calibrado com posts reais: abaixo de 100 letras o detector erra demais; até 300, só descarta com margem clara
const MIN_LETTERS = 100
const CONFIDENT_LETTERS = 300
const SHORT_TEXT_MARGIN = 0.9

export type LanguageCheck = {
	/** Idioma mais provável (ISO 639-1), ou `null` se o texto for curto demais para detectar. */
	language: string | null

	/** Motivo do descarte, ou `null` se o post pode seguir. */
	rejection: string | null
}

/**
 * Detecta o idioma do post (estatística de trigramas, sem IA) e diz se ele está fora de `allowedLanguages`.
 * Na dúvida (texto curto, margem pequena ou idioma aceito que o detector não conhece), o post segue.
 */
export function checkPostLanguage(text: string, allowedLanguages: string[]): LanguageCheck {
	const clean = stripNonProse(text)
	const letters = clean.replace(/[^\p{L}]/gu, '').length
	if (letters < MIN_LETTERS) return { language: null, rejection: null }

	const scores = new Map<string, number>(
		francAll(clean, { only: Object.keys(LANGUAGE_CODES), minLength: 1 }).map(([code, score]) => [LANGUAGE_CODES[code]!, score]),
	)
	const language = scores.keys().next().value ?? null

	const accepted = allowedLanguages.length === 0 || (language !== null && allowedLanguages.includes(language))
	const unknownAllowed = allowedLanguages.some(allowed => !scores.has(allowed))
	if (!language || accepted || unknownAllowed) return { language, rejection: null }

	const bestAllowed = Math.max(...allowedLanguages.map(allowed => scores.get(allowed) ?? 0))
	if (letters < CONFIDENT_LETTERS && bestAllowed >= SHORT_TEXT_MARGIN) return { language, rejection: null }

	return { language, rejection: `idioma ${language} fora dos aceitos (${allowedLanguages.join(', ')})` }
}

/** Tira links, e-mails, hashtags e menções, que não dizem nada sobre o idioma. */
function stripNonProse(text: string) {
	return text
		.normalize('NFKC')
		.replace(/https?:\/\/\S+|\S+@\S+|[#@]\S+/g, ' ')
		.replace(/\s+/g, ' ')
}
