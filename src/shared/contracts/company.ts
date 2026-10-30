/**
 * A comparação de empresas: a mesma empresa escrita de jeitos diferentes (repostagens, candidaturas parecidas) e as
 * empresas bloqueadas nas configurações.
 */

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

/** As palavras do nome em minúsculas, sem acentos, links, hashtags e pontuação ("Front-End" vira "frontend"). */
function companyWords(company: string) {
	return company
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/https?:\/\/\S+|www\.\S+/g, ' ')
		.replace(/#[\p{L}\p{N}_]+/gu, ' ')
		.replace(/(\p{L})[-‐–](\p{L})/gu, '$1$2')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
}

/** A empresa sem caixa, acentos, pontuação e sufixos ("ACME Tecnologia Ltda." e "Acme Tecnologia" são a mesma). */
export function normalizeCompany(company: string | null) {
	if (!company) return null

	const list = companyWords(company)
	while (list.length > 1 && COMPANY_SUFFIXES.has(list.at(-1)!)) list.pop()
	return list.join(' ') || null
}

/**
 * A empresa bloqueada (como está na lista) que pega a empresa da vaga, ou `null`. Casa pela sequência de palavras
 * inteiras, depois de `normalizeCompany`: "Itaú" pega "Banco Itaú S.A.", mas "Stone" não pega "Stonehenge Tech". Vaga
 * sem empresa (ou com a empresa confidencial) nunca é bloqueada.
 */
export function blockingCompany(company: string | null, blockedCompanies: readonly string[]) {
	const name = normalizeCompany(company)
	if (!name) return null

	return (
		blockedCompanies.find(entry => {
			const blocked = normalizeCompany(entry)
			return blocked !== null && ` ${name} `.includes(` ${blocked} `)
		}) ?? null
	)
}
