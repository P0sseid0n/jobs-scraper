import { jsonrepair } from 'jsonrepair'

import { CONTRACT_TYPES, SENIORITIES, type ContractType, type Seniority } from '@shared/contracts'

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

/** Descarta o local quando ele é só a modalidade ("Remoto", "100% home office"), que já tem campo próprio. */
export function locationWithoutWorkMode(location: string | null): string | null {
	if (!location) return null

	const normalized = location
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9% ]+/g, ' ')
		.trim()

	return WORK_MODE_ONLY.test(normalized) ? null : location
}

const WORK_MODE_ONLY = /^(100 ?% ?)?(remoto|remote|home ?office|hibrido|hybrid|presencial|on ?site)$/

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

/**
 * Termos de cada regime, procurados no texto sem acentos e em minúsculas. "CLT" e "PJ" quase só aparecem como
 * regime, então valem mesmo que o modelo não os devolva; "estágio" e "freelance" também aparecem em outros
 * sentidos ("estágio do processo", "já trabalhei como freelancer"), então só confirmam o que o modelo disse.
 */
const CONTRACT_TYPE_TERMS: Record<ContractType, { pattern: RegExp; reliable: boolean }> = {
	clt: { pattern: /(?<![a-z0-9])clt(?![a-z0-9])/, reliable: true },
	pj: { pattern: /(?<![a-z0-9])pj(?![a-z0-9])|pessoa juridica/, reliable: true },
	estagio: { pattern: /(?<![a-z0-9])(estagi(o|ario|aria)s?|internships?|interns?)(?![a-z0-9])/, reliable: false },
	freelance: { pattern: /(?<![a-z0-9])(free-?lance(rs?)?|freelas?)(?![a-z0-9])/, reliable: false },
}

/**
 * Decide os regimes da vaga pelo texto do post (evita regime inventado pelo modelo): fica cada regime escrito no
 * post que o modelo também indicou, mais "CLT" e "PJ" sempre que estiverem escritos. Com os dois ("CLT ou PJ"),
 * guarda os dois.
 * @returns Os regimes na ordem de `CONTRACT_TYPES`, ou `null` se o post não diz.
 */
export function keepContractTypesInPost(types: ContractType[] | null, text: string): ContractType[] | null {
	const normalizedText = normalizeForMatch(text)
	const fromModel = new Set(types ?? [])

	const kept = CONTRACT_TYPES.filter(type => {
		const { pattern, reliable } = CONTRACT_TYPE_TERMS[type]
		return (reliable || fromModel.has(type)) && pattern.test(normalizedText)
	})

	return kept.length > 0 ? kept : null
}

const WORD_START = '(?<![a-z0-9])'
const WORD_END = '(?![a-z0-9])'

/** "pleno" que não é nível: "pleno domínio", "conhecimento pleno", "em pleno crescimento". */
const PLENO_AS_LEVEL =
	`(?<!(conhecimento|dominio|em)\\s+)${WORD_START}pleno${WORD_END}` +
	'(?!\\s+(dominio|conhecimento|funcionamento|desenvolvimento|exercicio|emprego|crescimento|acordo|vigor))'

/**
 * Termos de cada nível no cargo e no resto do texto (sem acentos, em minúsculas). No cargo, o nível é quase sempre
 * literal, então valem até siglas ("Sr.", "PL", fora "PL/SQL") e termos como "Lead" e "Principal". No texto, só os
 * termos menos ambíguos: "principal" e "staff" soltos são comuns em português e inglês ("atividade principal").
 */
const SENIORITY_TERMS: Record<Seniority, { title: RegExp; text: RegExp }> = {
	junior: {
		title: new RegExp(`${WORD_START}(junior|jr)${WORD_END}`),
		text: new RegExp(`${WORD_START}(junior|jr)${WORD_END}`),
	},
	pleno: {
		title: new RegExp(`${WORD_START}(pleno|mid[- ]?level|pl${WORD_END}(?!\\s*[/-]?\\s*sql))`),
		text: new RegExp(`${PLENO_AS_LEVEL}|${WORD_START}mid[- ]?level${WORD_END}`),
	},
	senior: {
		title: new RegExp(`${WORD_START}(senior|sr)${WORD_END}`),
		text: new RegExp(`${WORD_START}(senior|sr)${WORD_END}`),
	},
	especialista: {
		title: new RegExp(`${WORD_START}(especialista|specialist|lead|staff|principal|lider tecnico)${WORD_END}`),
		text: new RegExp(`${WORD_START}(especialista|specialist|tech lead|lider tecnico|staff engineer|principal engineer)${WORD_END}`),
	},
}

/**
 * Decide os níveis da vaga pelo texto (evita nível inventado pelo modelo). O cargo manda: se ele cita níveis
 * ("Dev Pleno/Sênior"), ficam esses. Sem nível no cargo, fica cada nível que o modelo indicou e que está escrito
 * no post, fora os falsos positivos como "pleno domínio".
 * @returns Os níveis na ordem de `SENIORITIES`, ou `null` se o post não diz.
 */
export function keepSenioritiesInPost(levels: Seniority[] | null, title: string | null, text: string): Seniority[] | null {
	const normalizedTitle = normalizeForMatch(title ?? '')
	const fromTitle = SENIORITIES.filter(level => SENIORITY_TERMS[level].title.test(normalizedTitle))
	if (fromTitle.length > 0) return fromTitle

	const normalizedText = normalizeForMatch(text)
	const fromModel = new Set(levels ?? [])
	const kept = SENIORITIES.filter(level => fromModel.has(level) && SENIORITY_TERMS[level].text.test(normalizedText))

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
