import { franc, francAll } from 'franc-min'

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

/** Nomes ISO 639-1 dos idiomas de outros alfabetos, só para o motivo do descarte; os demais ficam com o código do franc. */
const OTHER_SCRIPT_CODES: Record<string, string> = {
	arb: 'ar',
	pes: 'fa',
	urd: 'ur',
	hin: 'hi',
	ben: 'bn',
	cmn: 'zh',
	jpn: 'ja',
	kor: 'ko',
	tha: 'th',
	heb: 'he',
	ell: 'el',
	ukr: 'uk',
}

// Calibrado com posts reais: abaixo de 100 letras o detector erra demais; até 300, só descarta com margem clara
const MIN_LETTERS = 100
const CONFIDENT_LETTERS = 300
const SHORT_TEXT_MARGIN = 0.9

// O alfabeto (árabe, chinês, devanágari…) se reconhece com bem menos letras que o idioma
const MIN_SCRIPT_LETTERS = 10

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
	if (letters < MIN_SCRIPT_LETTERS) return { language: null, rejection: null }

	const unknownAllowed = allowedLanguages.some(allowed => !Object.values(LANGUAGE_CODES).includes(allowed))
	const ranking = francAll(clean, { only: Object.keys(LANGUAGE_CODES), minLength: 1 })

	// Escrito num alfabeto que nenhum dos idiomas conhecidos usa: o franc restrito responde `und`
	if (ranking[0]?.[0] === 'und') {
		const code = franc(clean, { minLength: 1 })
		const language = code === 'und' ? null : (OTHER_SCRIPT_CODES[code] ?? code)
		return { language, rejection: unknownAllowed ? null : languageRejection(language, allowedLanguages) }
	}

	if (letters < MIN_LETTERS) return { language: null, rejection: null }

	const scores = new Map<string, number>(ranking.map(([code, score]) => [LANGUAGE_CODES[code]!, score]))
	const language = scores.keys().next().value ?? null

	const accepted = allowedLanguages.length === 0 || (language !== null && allowedLanguages.includes(language))
	if (!language || accepted || unknownAllowed) return { language, rejection: null }

	const bestAllowed = Math.max(...allowedLanguages.map(allowed => scores.get(allowed) ?? 0))
	if (letters < CONFIDENT_LETTERS && bestAllowed >= SHORT_TEXT_MARGIN) return { language, rejection: null }

	return { language, rejection: languageRejection(language, allowedLanguages) }
}

/** Motivo para descartar um post em `language`, ou `null` se ele é aceito ou o idioma é desconhecido. */
export function languageRejection(language: string | null, allowedLanguages: string[]): string | null {
	if (!language || allowedLanguages.length === 0 || allowedLanguages.includes(language)) return null
	return `idioma ${language} fora dos aceitos (${allowedLanguages.join(', ')})`
}

/** Tira links, e-mails, hashtags e menções, que não dizem nada sobre o idioma. */
function stripNonProse(text: string) {
	return text
		.normalize('NFKC')
		.replace(/https?:\/\/\S+|\S+@\S+|[#@]\S+/g, ' ')
		.replace(/\s+/g, ' ')
}
