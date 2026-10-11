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

const URL_PATTERN = /https?:\/\/[^\s<>"'()[\]]+/gi

/** Rótulos que acompanham o link e não são o cargo ("🔗 Candidate-se: https://..."). */
const LINK_LABEL =
	/(candidate-se|candidatar-se|candidatura|inscreva-se|inscricoes|inscrições|aplique|apply( here| now)?|link( da vaga)?|acesse|saiba mais)\s*[:-]?\s*$/i

/**
 * Reconhece posts de agregadores que listam várias vagas, cada uma com o próprio link
 * ("📄 Cargo" + "🔗 Candidate-se: https://lnkd.in/..."), em blocos ou uma por linha ("Cargo - https://...").
 * @returns As vagas (sem repetir link nem cargo), ou `null` se o post não seguir esse formato.
 */
export function splitMultiJobPost(text: string): JobListing[] | null {
	const lines = text.split('\n').map(line => line.trim())
	const listings: JobListing[] = []

	// Linhas desde a última linha em branco ou o último link: a última é o cargo da próxima vaga
	let pending: number[] = []

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
		const titleLine = inlineTitle ? index : (pending.at(-1) ?? index)
		const title = inlineTitle || cleanTitle(lines[titleLine] ?? '')

		if (title && title.length <= MAX_TITLE_LENGTH && /\p{L}/u.test(title)) {
			listings.push({ title, link, text: lines.slice(titleLine, index + 1).join('\n') })
		}

		pending = []
	}

	const unique = uniqueListings(listings)
	return unique.length >= MIN_LISTINGS ? unique : null
}

/** Tira emojis, marcadores, numeração ("1." "2)") e o rótulo do link, deixando só o cargo. */
function cleanTitle(text: string) {
	return text
		.replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu, ' ')
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
