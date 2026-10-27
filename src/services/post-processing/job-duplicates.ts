/**
 * Reconhece a mesma vaga repostada em outro post (por outro recrutador, ou dias depois com o texto um pouco mudado).
 * O critério é conservador: separar duas vagas iguais é menos grave que esconder uma vaga diferente. Por isso o cargo
 * sempre precisa bater, e sem empresa a vaga só é agrupada pelo link de candidatura.
 */

/** O que a detecção lê de cada vaga. */
export type DuplicateCandidate = {
	postId: string
	title: string | null
	company: string | null
	applyLink: string | null
	rawContent: string
	sourcePostId?: string | null
}

export type DuplicateMatch = { postId: string; reason: 'applyLink' | 'text'; similarity: number }

/** Os níveis de senioridade: dois cargos com níveis diferentes ("Pleno" e "Sênior") são vagas diferentes. */
const SENIORITY: Record<string, string> = {
	estagio: 'intern',
	estagiario: 'intern',
	estagiaria: 'intern',
	intern: 'intern',
	internship: 'intern',
	trainee: 'trainee',
	junior: 'junior',
	jr: 'junior',
	pleno: 'mid',
	pl: 'mid',
	mid: 'mid',
	senior: 'senior',
	sr: 'senior',
	especialista: 'specialist',
	specialist: 'specialist',
	staff: 'staff',
	principal: 'principal',
	lead: 'lead',
	lider: 'lead',
}

/** Grafias da mesma palavra no cargo. */
const TITLE_SYNONYMS: Record<string, string> = {
	dev: 'desenvolvedor',
	developer: 'desenvolvedor',
	desenvolvedora: 'desenvolvedor',
	programador: 'desenvolvedor',
	programadora: 'desenvolvedor',
	engineer: 'engenheiro',
	engenheira: 'engenheiro',
	analyst: 'analista',
}

const TITLE_STOPWORDS = new Set([
	'de',
	'da',
	'do',
	'das',
	'dos',
	'em',
	'para',
	'e',
	'a',
	'o',
	'the',
	'of',
	'and',
	'vaga',
	'i',
	'ii',
	'iii',
])

/** Últimos trechos de um caminho que são a página de carreiras da empresa, não de uma vaga. */
const CAREER_PAGES = new Set([
	'careers',
	'career',
	'carreiras',
	'carreira',
	'jobs',
	'job',
	'vagas',
	'vaga',
	'trabalhe-conosco',
	'trabalheconosco',
	'work-with-us',
	'join-us',
	'joinus',
	'oportunidades',
	'talentos',
	'openings',
	'job-openings',
])

/** Perfis do LinkedIn (empresa, pessoa, escola): nunca são a página de uma vaga. */
const LINKEDIN_PROFILE = /^\/(company|in|school|showcase|feed)(\/|$)/

/** Texto em minúsculas, sem acentos. */
function fold(text: string) {
	return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** As palavras do texto, sem links, hashtags, emojis e pontuação ("front-end" vira "frontend"). */
export function words(text: string) {
	return fold(text)
		.replace(/https?:\/\/\S+|www\.\S+/g, ' ')
		.replace(/#[\p{L}\p{N}_]+/gu, ' ')
		.replace(/(\p{L})[-‐–](\p{L})/gu, '$1$2')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
}

/** Os trigramas de palavras do texto; texto com menos de três palavras vira um único "trigrama". */
export function wordTrigrams(text: string) {
	const list = words(text)
	if (list.length < 3) return new Set(list.length ? [list.join(' ')] : [])

	const trigrams = new Set<string>()
	for (let index = 0; index + 2 < list.length; index++) trigrams.add(`${list[index]} ${list[index + 1]} ${list[index + 2]}`)
	return trigrams
}

/** Jaccard de dois conjuntos (0 a 1); dois conjuntos vazios não são parecidos. */
export function jaccard<T>(a: Set<T>, b: Set<T>) {
	if (a.size === 0 || b.size === 0) return 0

	let shared = 0
	for (const item of a) if (b.has(item)) shared++
	return shared / (a.size + b.size - shared)
}

/** Semelhança do texto de dois posts: Jaccard dos trigramas de palavras. */
export function textSimilarity(a: string, b: string) {
	return jaccard(wordTrigrams(a), wordTrigrams(b))
}

const COMPANY_SUFFIXES = new Set([
	'ltda',
	'sa',
	's',
	'a',
	'me',
	'eireli',
	'inc',
	'ltd',
	'llc',
	'corp',
	'co',
	'gmbh',
	'brasil',
	'brazil',
])

/** A empresa sem caixa, acentos, pontuação e sufixos ("ACME Tecnologia Ltda." e "Acme Tecnologia" são a mesma). */
export function normalizeCompany(company: string | null) {
	if (!company) return null

	const list = words(company)
	while (list.length > 1 && COMPANY_SUFFIXES.has(list.at(-1)!)) list.pop()
	return list.join(' ') || null
}

/** O cargo separado em palavras principais e níveis de senioridade. */
function titleParts(title: string) {
	const core = new Set<string>()
	const seniority = new Set<string>()

	for (const word of words(title)) {
		if (word in SENIORITY) {
			seniority.add(SENIORITY[word]!)
		} else if (!TITLE_STOPWORDS.has(word)) core.add(TITLE_SYNONYMS[word] ?? word)
	}

	return { core, seniority }
}

/**
 * Se dois cargos são o mesmo: os níveis não podem ser diferentes (um sem nível combina com qualquer um) e as palavras
 * principais precisam coincidir pelo menos pela metade, ou as de um estarem todas no outro.
 */
export function similarTitles(a: string | null, b: string | null) {
	if (!a || !b) return false

	const first = titleParts(a)
	const second = titleParts(b)
	if (first.seniority.size > 0 && second.seniority.size > 0 && jaccard(first.seniority, second.seniority) < 1) return false
	if (first.core.size === 0 || second.core.size === 0) return false

	const [smaller, larger] = first.core.size <= second.core.size ? [first.core, second.core] : [second.core, first.core]
	return jaccard(first.core, second.core) >= 0.5 || [...smaller].every(word => larger.has(word))
}

/**
 * O link de candidatura comparável: sem `www.`, parâmetros de rastreamento, âncora e barra final. `null` se ele é
 * genérico (a página de carreiras da empresa, um perfil do LinkedIn, a raiz de um site), que não identifica a vaga.
 */
export function specificApplyLink(link: string | null) {
	if (!link) return null

	let url: URL
	try {
		url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`)
	} catch {
		return null
	}

	const host = url.hostname.toLowerCase().replace(/^www\./, '')
	const path = url.pathname.replace(/\/+$/, '')
	for (const key of [...url.searchParams.keys()]) if (/^utm_|^(ref|source|trk|refid)$/i.test(key)) url.searchParams.delete(key)
	url.searchParams.sort()
	const query = url.searchParams.toString()

	if (!path && !query) return null
	if (/(^|\.)linkedin\.com$/.test(host) && LINKEDIN_PROFILE.test(path)) return null
	if (!query && CAREER_PAGES.has(fold(path.split('/').at(-1) ?? ''))) return null

	return `${host}${path}${query ? `?${query}` : ''}`
}

/**
 * Procura, entre as vagas recentes, a vaga original de que `job` é repostagem. Do critério mais forte ao mais fraco:
 * - o mesmo link de candidatura específico, com o mesmo cargo (e a empresa, quando as duas a citam, igual);
 * - a mesma empresa e o mesmo cargo, com o texto do post parecido (`minSimilarity`, de 0 a 1).
 * Sem empresa, só o link agrupa. Vagas de um mesmo post com várias vagas nunca são agrupadas entre si.
 * @returns A vaga mais provável, ou `null` se nenhuma é a mesma.
 */
export function findDuplicate(
	job: DuplicateCandidate,
	candidates: DuplicateCandidate[],
	minSimilarity: number,
): DuplicateMatch | null {
	const link = specificApplyLink(job.applyLink)
	const company = normalizeCompany(job.company)
	let best: DuplicateMatch | null = null

	for (const candidate of candidates) {
		if (candidate.postId === job.postId) continue
		if (job.sourcePostId && candidate.sourcePostId === job.sourcePostId) continue
		if (!similarTitles(job.title, candidate.title)) continue

		const candidateCompany = normalizeCompany(candidate.company)
		if (company && candidateCompany && company !== candidateCompany) continue

		const similarity = textSimilarity(job.rawContent, candidate.rawContent)

		if (link && link === specificApplyLink(candidate.applyLink)) {
			// O link vale mais que o texto: entre as do mesmo link, a de texto mais parecido
			const beatsBest = best?.reason !== 'applyLink' || similarity > best.similarity
			if (beatsBest) best = { postId: candidate.postId, reason: 'applyLink', similarity }
			continue
		}

		if (!company || !candidateCompany || similarity < minSimilarity) continue
		if (!best || (best.reason === 'text' && similarity > best.similarity))
			best = { postId: candidate.postId, reason: 'text', similarity }
	}

	return best
}
