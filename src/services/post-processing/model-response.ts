import { jsonrepair } from 'jsonrepair'

import { CONTRACT_TYPES, type ContractType, type WORK_MODES } from '@shared/contracts'

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
 * Mantém a empresa da IA só se ela estiver escrita no post fora dos links e e-mails: o modelo às vezes tira o nome
 * do domínio ("vagas.acme.com" → "acme"). Vale escrita separada ou junta, como numa hashtag ("#AcmeTech").
 */
export function keepCompanyIfInPost(company: string | null, text: string): string | null {
	if (!company) return null

	const textWithoutLinks = normalizeForMatch(text.normalize('NFKC'))
		.replace(/https?:\/\/\S+|www\.\S+/g, ' ')
		.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ')
		.replace(/(?<![a-z0-9])[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|app|br)(\/\S*)?/g, ' ')
	const words = normalizeForMatch(company)
		.split(/[^a-z0-9#+&]+/)
		.filter(Boolean)
	const compact = words.join('')

	if (words.length > 0 && words.every(word => containsWordStart(textWithoutLinks, word))) return company
	return compact.length >= 4 && textWithoutLinks.replace(/[^a-z0-9#+&]+/g, '').includes(compact) ? company : null
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

type WorkMode = (typeof WORK_MODES)[number]

/** Termos de cada modalidade no texto sem acentos e em minúsculas; sem fronteira de palavra, para valer em hashtags. */
const WORK_MODE_TERMS: Record<WorkMode, RegExp> = {
	remoto: /remot[oa]|remote|home ?-?office|teletrabalho/,
	presencial: /presencia(l|is)|on-?site|in-?office/,
	hibrido: /hibrid[oa]|hybrid/,
}

/**
 * Mantém a modalidade da IA só se ela estiver escrita no post: o modelo às vezes a deduz do cargo (enfermeiro de
 * centro cirúrgico → presencial). "3 dias presenciais e 2 remotos" também vale como híbrido.
 */
export function keepWorkModeInPost(workMode: WorkMode | null, text: string): WorkMode | null {
	if (!workMode) return null

	const normalizedText = normalizeForMatch(text.normalize('NFKC'))
	if (WORK_MODE_TERMS[workMode].test(normalizedText)) return workMode
	if (workMode === 'hibrido' && WORK_MODE_TERMS.presencial.test(normalizedText) && WORK_MODE_TERMS.remoto.test(normalizedText)) {
		return workMode
	}
	return null
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
