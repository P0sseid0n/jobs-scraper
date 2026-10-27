import { createHash } from 'node:crypto'

/**
 * Uma vaga de um post com várias: o cargo, o link para se candidatar e as linhas do post sobre ela. O texto em volta
 * (ex.: "10 VAGAS EM TODO BRASIL") fica de fora: ele descreve a lista, e a IA o tomaria como dado da vaga (o local).
 */
export type JobListing = {
	title: string
	link: string
	text: string
}

/** Abaixo disso é um post comum com alguns links (site, formulário...), não uma lista de vagas. */
const MIN_LISTINGS = 3
const MAX_TITLE_LENGTH = 120
/** Cargo com mais palavras que isso é uma frase ("Desenvolvimento de jogos: converse sobre programação, mecânicas..."). */
const MAX_TITLE_WORDS = 12

const URL_PATTERN = /https?:\/\/[^\s<>"'()[\]]+/gi

/** Rótulos que acompanham o link e não são o cargo ("🔗 Candidate-se: https://..."). */
const LINK_LABEL =
	/(candidate-se|candidatar-se|candidatura|inscreva-se|inscricoes|inscrições|aplique|apply( here| now)?|link( da vaga)?|acesse|saiba mais)\s*[:-]?\s*$/i

/** Caracteres com que os autores forçam uma linha "em branco" no LinkedIn: o espaço braille e os de largura zero. */
const INVISIBLE = /[\u2800\u200B-\u200D\u2060\uFEFF\u3164]/g

/** Início de item numerado: "1️⃣", "🔟", "1." ou "2)". */
const NUMBERED_ITEM = /^(\d\u{FE0F}?\u{20E3}|\u{1F51F}|\d{1,2}[.)]\s)/u

/**
 * Palavras de quem divulga vagas, no texto sem acentos. Sem nenhuma, os links são de outra coisa: um projeto com
 * "🌐 Aplicação:", "📦 Backend:" e "📦 Frontend:" tinha o formato de uma lista de vagas. "Candidatos" fica de fora
 * (posts sobre eleição).
 */
const HIRING_SIGNAL =
	/\b(vagas?|contratando|contratamos|contrata-se|recrutando|oportunidades?|candidate-se|candidatar|candidatura|inscreva-se|inscricoes|hiring|jobs?|openings?|positions?|apply)\b/i

/**
 * Reconhece posts de agregadores que listam várias vagas, cada uma com o próprio link
 * ("📄 Cargo" + "🔗 Candidate-se: https://lnkd.in/..."), em blocos ou uma por linha ("Cargo - https://...").
 * @returns As vagas (sem repetir link nem cargo), ou `null` se o post não seguir esse formato ou não falar de vagas.
 */
export function splitMultiJobPost(text: string): JobListing[] | null {
	if (
		!HIRING_SIGNAL.test(
			text
				.replace(URL_PATTERN, ' ')
				.normalize('NFKD')
				.replace(/\p{Diacritic}/gu, ''),
		)
	)
		return null

	const lines = text.split('\n').map(line => (line.replace(INVISIBLE, '').trim() ? line.trim() : ''))
	const listings: JobListing[] = []

	// Linhas desde a última linha em branco ou o último link: a última é o cargo da próxima vaga
	let pending: number[] = []
	// Primeira linha depois do último link: o bloco da próxima vaga, que pode ter vários parágrafos
	let blockStart = 0

	for (const [index, line] of lines.entries()) {
		const urls = line.match(URL_PATTERN) ?? []

		if (urls.length === 0) {
			if (line) pending.push(index)
			else pending = []
			continue
		}

		// Mais de um link na mesma linha: não dá para saber qual é de qual vaga
		if (urls.length > 1) return null

		const link = trimUrl(urls[0] ?? '')
		const inlineTitle = cleanTitle(line.slice(0, line.search(URL_PATTERN)))
		const titleLine = inlineTitle ? index : findTitleLine(lines, pending, blockStart, index)
		const title = inlineTitle || cleanTitle(lines[titleLine] ?? '')

		if (title && title.length <= MAX_TITLE_LENGTH && /\p{L}/u.test(title)) {
			listings.push({ title, link, text: lines.slice(titleLine, index + 1).join('\n') })
		}

		pending = []
		blockStart = index + 1
	}

	const unique = uniqueListings(listings)
	if (unique.length < MIN_LISTINGS) return null

	// A maioria dos "cargos" é frase: o post apresenta links de outra coisa (os grupos de uma comunidade, com
	// "JavaScript é sua praia? Entre no grupo..." antes do convite do WhatsApp), não uma lista de vagas
	const prose = unique.filter(listing => isProse(listing.title)).length
	return prose * 2 > unique.length ? null : unique
}

/** Frase, e não cargo: pergunta, exclamação, ponto final ou palavras demais. */
function isProse(title: string) {
	return /[?!]|\.$/.test(title) || title.split(' ').length > MAX_TITLE_WORDS
}

/**
 * Linha do cargo de uma vaga com o link sozinho na linha: a linha antes do link ou, se ela for só o rótulo
 * ("Candidatura:"), o item numerado do bloco ("1️⃣ DIGITAL AD QUALITY ANALYST", parágrafos acima) ou a primeira
 * linha do parágrafo.
 */
function findTitleLine(lines: string[], pending: number[], blockStart: number, linkLine: number) {
	const previous = pending.at(-1) ?? linkLine
	if (cleanTitle(lines[previous] ?? '')) return previous

	for (let index = linkLine - 1; index >= blockStart; index--) {
		if (NUMBERED_ITEM.test(lines[index] ?? '')) return index
	}

	return pending[0] ?? previous
}

/**
 * Texto da vaga para o filtro de palavras-chave, sem os links: o cargo da lista às vezes é a empresa
 * ("3️⃣ INFLECT", com "Senior Fullstack Engineer" na linha seguinte).
 */
export function listingKeywordText(listing: JobListing) {
	return listing.text.replace(URL_PATTERN, ' ')
}

/** Tira emojis, marcadores, numeração ("1." "2)" "1️⃣") e o rótulo do link, deixando só o cargo. */
function cleanTitle(text: string) {
	return text
		.replace(/\d\u{FE0F}?\u{20E3}|\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu, ' ')
		.replace(/^[\s\d.)\-–—•*|:]+(?=\p{L})/u, '')
		.replace(LINK_LABEL, '')
		.replace(/[\s:\-–—|•]+$/u, '')
		.replace(/\s+/g, ' ')
		.trim()
}

/** Pontuação colada no fim do link ("...lnkd.in/abc." ou "(https://...)") não faz parte dele. */
function trimUrl(url: string) {
	return url.replace(/[.,;:!?]+$/, '')
}

/** O mesmo link ou o mesmo cargo repetido no post viram uma vaga só (a primeira). */
function uniqueListings(listings: JobListing[]) {
	const seen = new Set<string>()

	return listings.filter(listing => {
		const title = listing.title.toLowerCase()
		if (seen.has(listing.link) || seen.has(title)) return false

		seen.add(listing.link).add(title)
		return true
	})
}

/** ID estável da vaga de uma lista (hash do link): a mesma vaga em outra coleta não é aberta de novo. */
export function listingPostId(link: string) {
	return createHash('sha256').update(link).digest('hex')
}
