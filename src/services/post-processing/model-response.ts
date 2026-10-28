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
export function rejectionReason(job: AiJobOutput | null): string | null {
	if (!job) return 'modelo respondeu null'
	if (!job.isJob) return `modelo indicou que não é vaga (${job.postType ?? 'isJob=false'})`
	return null
}

/**
 * Se o cargo da IA está escrito no post: cada palavra dele precisa começar alguma palavra do texto, ignorando caixa,
 * acentos, conectivos ("e", "de", "and"), plural e gênero ("Desenvolvedora" ↔ "Desenvolvedor(a)").
 */
export function titleInPost(title: string, text: string) {
	const normalizedText = normalizeForMatch(text.normalize('NFKC'))
	const words = normalizeForMatch(title.normalize('NFKC'))
		.split(/[^a-z0-9#+]+/)
		.filter(word => word.length > 2 && !TITLE_CONNECTIVES.has(word))
		.map(word => word.replace(/(?<=.{4})(as|os|es|a|o|s)$/, ''))

	return words.every(word => containsWordStart(normalizedText, word))
}

const TITLE_CONNECTIVES = new Set(['and', 'com', 'das', 'dos', 'for', 'the', 'para'])

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

/** A empresa da IA e o autor do post: os candidatos a empresa da vaga (ver `chooseCompany`). */
export type CompanySources = { aiCompany: string | null; author: string | null; authorIsCompany: boolean }

/**
 * Escolhe a empresa somando o peso de cada sinal: escrita no post (2), autor do post que é página de empresa (3),
 * escolhida pela IA (1) e no domínio de um e-mail do post (1; e-mail gratuito não conta). Fica a de mais pontos, se
 * chegar a 3: o domínio com a IA não basta (ela tirava "acme" de rh@acme.com), a página da empresa basta (a empresa
 * nem sempre escreve o próprio nome). No empate fica a da IA: a página de uma agência citando o cliente.
 * @param text O texto do post (com a transcrição das imagens).
 */
export function chooseCompany({ aiCompany, author, authorIsCompany }: CompanySources, text: string): string | null {
	const domains = emailDomains(text)
	const score = (name: string) =>
		(keepCompanyIfInPost(name, text) ? 2 : 0) + (domains.some(domain => companyInDomain(name, domain)) ? 1 : 0)

	const candidates: { name: string; points: number }[] = []
	const ai = aiCompany?.trim()
	const pageAuthor = authorIsCompany ? author?.trim() : null

	// A IA citando o próprio autor ("Cadmus" no post da "Cadmus Soluções em TI") é um candidato só, com o nome da página
	if (ai && pageAuthor && sameCompany(ai, pageAuthor)) candidates.push({ name: pageAuthor, points: 1 + 3 + score(ai) })
	else {
		if (ai) candidates.push({ name: ai, points: 1 + score(ai) })
		if (pageAuthor) candidates.push({ name: pageAuthor, points: 3 + score(pageAuthor) })
	}

	const best = candidates.reduce<(typeof candidates)[number] | null>(
		(winner, candidate) => (!winner || candidate.points > winner.points ? candidate : winner),
		null,
	)
	return best && best.points >= 3 ? best.name : null
}

/** Mesma empresa escrita mais curta ou mais longa: "Cadmus" e "Cadmus Soluções em TI", "Capitani Group" e "CapitaniGroup". */
export function sameCompany(a: string, b: string) {
	const [shorter, longer] = [compactName(a), compactName(b)].sort((x, y) => x.length - y.length)
	return !!shorter && !!longer && shorter.length >= 3 && longer.startsWith(shorter)
}

/** Domínios dos e-mails do post, menos os de e-mail gratuito (o "Outlook" não é a empresa de quem escreve dele). */
function emailDomains(text: string) {
	return [...normalizeForMatch(text.normalize('NFKC')).matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)]
		.map(match => (match[1] ?? '').split('.'))
		.filter(labels => !labels.some(label => FREE_EMAIL.has(label)))
}

const FREE_EMAIL = new Set([
	'aol',
	'bol',
	'gmail',
	'googlemail',
	'hotmail',
	'icloud',
	'live',
	'msn',
	'outlook',
	'proton',
	'protonmail',
	'terra',
	'uol',
	'yahoo',
	'ymail',
])

/** O nome junto bate com uma parte do domínio, numa ponta ou na outra: "Cadmus Soluções" ↔ rh@cadmus.com.br. */
function companyInDomain(name: string, labels: string[]) {
	const compact = compactName(name)
	return labels.some(
		label => label.length >= 4 && compact.length >= 4 && (compact.startsWith(label) || label.startsWith(compact)),
	)
}

function compactName(name: string) {
	return normalizeForMatch(name.normalize('NFKC')).replace(/[^a-z0-9#+&]+/g, '')
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
 * guarda os dois. Estágio e freelance no cargo ("Estágio em Desenvolvimento", "Freelancer Designer") valem como
 * indicados: o prompt manda o modelo responder [] sem regime escrito, e ele às vezes não liga o cargo ao regime.
 * @param title O cargo da IA (já é escrito no post, ou a vaga leva o check de cargo).
 * @returns Os regimes na ordem de `CONTRACT_TYPES`, ou `null` se o post não diz.
 */
export function keepContractTypesInPost(
	types: ContractType[] | null,
	text: string,
	title: string | null = null,
): ContractType[] | null {
	const normalizedText = normalizeForMatch(text)
	const normalizedTitle = normalizeForMatch(title ?? '')
	const fromModel = new Set(types ?? [])

	const kept = CONTRACT_TYPES.filter(type => {
		const { pattern, reliable } = CONTRACT_TYPE_TERMS[type]
		return (reliable || fromModel.has(type) || pattern.test(normalizedTitle)) && pattern.test(normalizedText)
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
