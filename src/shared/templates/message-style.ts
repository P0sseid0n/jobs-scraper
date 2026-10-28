import type { MessageDefaultTone, MessageLength, MessageTone } from '../contracts/settings'

/**
 * As regras de estilo do e-mail de candidatura escrito pela IA, usadas ao gerar (cv-updater) e ao reescrever com outro
 * tom ou tamanho (site). Os prompts ficam em inglês, como os outros: modelos pequenos seguem melhor.
 */

export type MessageLanguage = 'pt' | 'en'

export const MESSAGE_LANGUAGE_NAMES: Record<MessageLanguage, string> = { pt: 'Brazilian Portuguese', en: 'English' }

/** Idioma da mensagem: o do post quando é inglês; português nos outros casos (inclusive idioma desconhecido). */
export function messageLanguage(postLanguage: string | null): MessageLanguage {
	return postLanguage === 'en' ? 'en' : 'pt'
}

/** Tamanho aceito do corpo, em caracteres. O prompt pede 100 a menos que o máximo, para sobrar folga. */
export const BODY_LIMITS: Record<MessageLength, { min: number; max: number }> = {
	short: { min: 80, max: 450 },
	medium: { min: 150, max: 700 },
}

/** Saudação e despedida de cada tom: também valem como palavras conhecidas na reescrita (`newProperNouns`). */
const TONE_WORDS: Record<MessageTone, Record<MessageLanguage, { greeting: string; closing: string }>> = {
	formal: {
		pt: { greeting: 'Prezados,', closing: 'Agradeço a atenção.' },
		en: { greeting: 'Dear Hiring Team,', closing: 'Thank you for your consideration.' },
	},
	neutral: {
		pt: { greeting: 'Olá! Tudo bem?', closing: 'Obrigado!' },
		en: { greeting: 'Hello,', closing: 'Thank you!' },
	},
	casual: {
		pt: { greeting: 'Oi, pessoal! Tudo bem?', closing: 'Abraço!' },
		en: { greeting: 'Hi there!', closing: 'Cheers!' },
	},
}

const TONE_STYLE: Record<MessageTone, string> = {
	formal: 'complete, careful sentences; no exclamation marks, no contractions and no slang',
	neutral: 'polite and direct, like a professional who is easy to talk to',
	casual: 'short, conversational sentences, like a message to a future colleague; still respectful, with no slang and no emojis',
}

/** Com a mensagem de exemplo, a saudação e o fechamento vêm dela: o tom só ajusta a formalidade. */
function toneRule(tone: MessageTone, withSample: boolean) {
	if (withSample) return `${tone}: ${TONE_STYLE[tone]}.`

	const { pt, en } = TONE_WORDS[tone]
	return `${tone}: ${TONE_STYLE[tone]}. Greet with "${pt.greeting}" in Portuguese or "${en.greeting}" in English; end with "${pt.closing}" in Portuguese or "${en.closing}" in English.`
}

/** Linhas com link (assinatura com GitHub, LinkedIn): a IA copiaria o link na mensagem. */
const LINK_LINE = /https?:\/\/|www\./i

/** A mensagem de exemplo como vai para a IA: sem as linhas com link e sem linhas em branco sobrando. */
export function styleSampleText(sample: string) {
	return sample
		.split('\n')
		.filter(line => !LINK_LINE.test(line))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

const LENGTH_RULES: Record<MessageLength, string> = {
	short: `Very short, for a LinkedIn direct message: at most ${BODY_LIMITS.short.max - 100} characters, in 1 or 2 short paragraphs with at most 3 sentences besides the greeting. Mention at most 2 skills and no project.`,
	medium: `At most ${BODY_LIMITS.medium.max - 100} characters, in 2 or 3 short paragraphs.`,
}

/**
 * Expressões batidas que fazem a mensagem soar como escrita por IA, recusadas em qualquer tom. `label` é como a
 * expressão aparece no prompt e no motivo da recusa.
 */
export const MESSAGE_CLICHES: { label: string; pattern: RegExp }[] = [
	{ label: 'manifestar meu interesse', pattern: /(manifestar|expressar|demonstrar)\s+(o\s+)?(meu\s+)?(grande\s+)?interesse/i },
	{ label: 'venho por meio desta', pattern: /venho\s+por\s+meio\s+dest[ae]/i },
	{ label: 'soluções inovadoras', pattern: /solu[çc][õo]es\s+inovadoras/i },
	{ label: 'agregar valor', pattern: /agregar\s+(muito\s+)?valor/i },
	{ label: 'apaixonado por', pattern: /apaixonad[oa]s?\s+por|paix[ãa]o\s+por/i },
	{ label: 'fazer a diferença', pattern: /fazer\s+a\s+diferen[çc]a/i },
	{ label: 'novos desafios', pattern: /novos\s+desafios/i },
	{ label: 'oportunidade única', pattern: /oportunidade\s+[úu]nica/i },
	{ label: 'ambiente dinâmico', pattern: /ambiente\s+din[âa]mico/i },
	{ label: 'sinergia', pattern: /\bsinergia/i },
	{ label: 'proativo', pattern: /\bproativ[oa]s?\b/i },
	{ label: 'se alinham com os requisitos', pattern: /alinha[mr]?\s+(perfeitamente\s+)?(com\s+os|aos)\s+requisitos/i },
	{ label: 'me permite contribuir', pattern: /permite[m]?\s+contribuir/i },
	{ label: 'express my interest', pattern: /express(ing)?\s+my\s+(strong\s+|keen\s+|sincere\s+)?interest/i },
	{ label: 'I am writing to', pattern: /\bI\s+am\s+writing\s+to\b/i },
	{ label: 'passionate about', pattern: /passionate\s+about/i },
	{ label: 'add value', pattern: /\badd(ing)?\s+(real\s+)?value/i },
	{ label: 'innovative solutions', pattern: /innovative\s+solutions/i },
	{ label: 'team player', pattern: /team\s+player/i },
	{ label: 'fast-paced', pattern: /fast[-\s]paced/i },
	{ label: 'dynamic environment', pattern: /dynamic\s+(team|environment)/i },
	{ label: 'make a difference', pattern: /make\s+a\s+difference/i },
	{ label: 'synergy', pattern: /\bsynerg/i },
	{ label: 'excited to apply', pattern: /excited\s+to\s+apply/i },
]

/** Os clichês (`label`) que aparecem no texto. */
export function clichesIn(body: string) {
	return MESSAGE_CLICHES.filter(cliche => cliche.pattern.test(body)).map(cliche => cliche.label)
}

/**
 * As regras de tom, tamanho e clichês para o prompt. Com `auto`, a IA escolhe o tom pelo post e o devolve em "tone".
 * Com a mensagem de exemplo da pessoa, a voz dela (saudação, expressões, fechamento) manda; o tom só ajusta a formalidade.
 */
export function messageStyleRules(tone: MessageDefaultTone, length: MessageLength, styleSample = '') {
	const sample = styleSampleText(styleSample)
	const withSample = sample !== ''
	const toneLines =
		tone === 'auto'
			? [
					'- Choose the tone that fits the job post and return it in "tone": "formal" for banks, law firms, the public sector, large traditional companies or a formal post; "casual" for startups, agencies or a relaxed post (emojis, slang, first names); "neutral" otherwise. Then follow that tone:',
					...(['formal', 'neutral', 'casual'] as const).map(name => `  - ${toneRule(name, withSample)}`),
				]
			: [`- Tone ${toneRule(tone, withSample)}`]
	const voiceLines = withSample ? sampleVoiceRules(sample) : []

	return [
		...voiceLines,
		...toneLines,
		`- ${LENGTH_RULES[length]}`,
		`- Never use these clichés (or translations of them): ${MESSAGE_CLICHES.map(cliche => `"${cliche.label}"`).join(', ')}. Say concretely what you did instead.`,
	].join('\n')
}

/**
 * As regras da voz da pessoa. Modelos pequenos seguem a mensagem atual (ou o próprio hábito) e ignoram um exemplo só
 * descrito: a primeira e a última frase dele vão escritas na regra, como a abertura e o fechamento a seguir.
 */
function sampleVoiceRules(sample: string) {
	const lines = sample
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
	const opening = lines[0]!
		.split(/(?<=[.!?])\s+/)
		.slice(0, 2)
		.join(' ')
	const closing = lines.at(-1)!

	return [
		'- Use "Writing sample" as a template: follow its sentences in order, with the same way of introducing themselves (keep their real name exactly as written, never "[Nome]" or another placeholder), the same expressions and the same closing, and swap the role, company and skills of that other opening for the facts of this one. The tone only adjusts how formal it is.',
		`- Open like the sample does ("${opening}"), with this opening's role, instead of a generic greeting like "Olá! Tudo bem?".`,
		...(lines.length > 1 ? [`- Close like the sample does ("${closing}").`] : []),
	]
}

/** A seção do prompt com a mensagem de exemplo da pessoa (vazia quando não há exemplo), sem as linhas com link. */
export function styleSampleSection(sample: string) {
	const text = styleSampleText(sample)
	if (!text) return []

	return [
		`## Writing sample\nA message the person wrote to another recruiter: the template for the new message. The person's name in it is theirs: keep it. Its role, company, skills and other facts belong to another opening: never copy them.\n${text}`,
	]
}

/** Como a pessoa se apresenta no exemplo ("Me chamo Matheus", "My name is Ana"): o nome vem no grupo `name`. */
const SELF_INTRODUCTION = /\b(?:[Mm]e chamo|[Mm]eu nome é|[Mm]y name is|I'm|I am)\s+(?<name>\p{Lu}[\p{L}'-]+)/u

/** Placeholder de nome que modelos pequenos põem no lugar do nome, mesmo com ele no exemplo. */
const NAME_PLACEHOLDER = /\[\s*(?:seu\s+|your\s+)?(?:nome|name)[^\]]*\]/giu

/** O primeiro nome com que a pessoa se apresenta na mensagem de exemplo, ou `null`. */
export function sampleName(sample: string) {
	return SELF_INTRODUCTION.exec(styleSampleText(sample))?.groups?.name ?? null
}

/**
 * Troca o placeholder de nome ("[Nome]") pelo nome com que a pessoa se apresenta no exemplo. Sem nome no exemplo, o
 * placeholder fica, e a validação recusa a mensagem.
 */
export function fillSampleName(body: string, sample: string) {
	const name = sampleName(sample)
	return name ? body.replace(NAME_PLACEHOLDER, name) : body
}

const PLACEHOLDER = /\[[^\]]*\]|<[^>]*>|\{[^}]*\}|\bx{3,}\b|seu nome|your name|nome da empresa|company name/i
const MARKDOWN = /\*\*|^\s*#+\s|^\s*[-*]\s|```/m
const YEARS_CLAIM = /\d+\s*\+?\s*(anos|years)\b/i
const SUBJECT_LINE = /^\s*(assunto|subject)\s*:[^\n]*\n+/i

/** Tira o assunto repetido e os espaços extras, mantendo os parágrafos. */
export function cleanMessageBody(text: string) {
	return text
		.replace(SUBJECT_LINE, '')
		.split('\n')
		.map(line => line.trim().replace(/\s+/g, ' '))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

/**
 * As validações que valem para qualquer mensagem: tamanho, texto puro, sem placeholders, sem anos de experiência e
 * sem clichês. As do conteúdo (tecnologias, fatos) ficam com quem escreve.
 * @returns O motivo da recusa (em inglês, para devolver ao modelo), ou `null`.
 */
export function messageTextProblem(body: string, length: MessageLength): string | null {
	const { min, max } = BODY_LIMITS[length]

	if (!body) return 'empty or invalid JSON'
	if (body.length < min || body.length > max) return `length ${body.length} is outside ${min}-${max} characters`
	if (PLACEHOLDER.test(body)) return 'it has a placeholder to fill in'
	if (MARKDOWN.test(body)) return 'it uses markdown; write plain text'
	if (YEARS_CLAIM.test(body)) return 'it claims years of experience'

	const cliches = clichesIn(body).map(label => `"${label}"`)
	if (cliches.length > 0) return `it uses clichés: ${cliches.join(', ')}`

	return null
}

/** Palavras com maiúscula que não são nomes próprios (saudações, despedidas, siglas comuns). */
const COMMON_CAPITALIZED = new Set(
	[
		...Object.values(TONE_WORDS).flatMap(languages =>
			Object.values(languages).flatMap(({ greeting, closing }) => `${greeting} ${closing}`.split(/[^\p{L}]+/u)),
		),
		...['i', "i'm", "i've", "i'd", "i'll", 'linkedin', 'rh', 'hr', 'cv'],
	]
		.map(word => word.toLowerCase())
		.filter(Boolean),
)

const WORD = /[\p{L}\p{N}][\p{L}\p{N}.+#/'’-]*/gu

/**
 * Nomes próprios (palavras com maiúscula fora do começo da frase, como tecnologias, empresas e projetos) que estão no
 * texto e em nenhuma das fontes. Na reescrita, as fontes são a mensagem anterior e a vaga: um nome novo foi inventado.
 */
export function newProperNouns(body: string, sources: string[]) {
	const known = sources.join('\n')
	const found = new Set<string>()

	for (const match of body.matchAll(WORD)) {
		const word = match[0].replace(/[.,/'’-]+$/, '')
		if (!/\p{Lu}/u.test(word) || COMMON_CAPITALIZED.has(word.toLowerCase())) continue

		const before = body.slice(0, match.index).trimEnd()
		// No começo de uma frase, qualquer palavra tem maiúscula; só as com maiúscula no meio ("TypeScript") contam
		if ((before === '' || /[.!?:\n]$/.test(before)) && !/\p{Lu}/u.test(word.slice(1))) continue

		const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		if (!new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(known)) found.add(word)
	}

	return [...found]
}
