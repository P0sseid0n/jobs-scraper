import { ExtractionCaseSchema, type ExtractionCase } from './extraction-eval'

/** Casos de avaliação versionados, exportados por `bun eval:export-fixtures` e lidos por `bun eval:extraction --fixtures`. */
export const DEFAULT_FIXTURES_PATH = Bun.fileURLToPath(new URL('./fixtures/extraction-cases.json', import.meta.url))

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const LINKEDIN_PROFILE = /linkedin\.com\/in\/[^\s/?#)"]+/gi
// Links curtos do LinkedIn costumam levar ao perfil ou ao portfólio de quem postou
const LINKEDIN_SHORT_LINK = /lnkd\.in\/[\w-]+/gi
// Telefones brasileiros: "(11) 91234-5678", "+55 11 912345678", "11 3456-7890"
const PHONE = /(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g

const PLACEHOLDER_EMAIL = /^contato\d+@exemplo\.com$/
const PLACEHOLDER_AUTHOR = 'Autor do post'

/**
 * Tira os dados pessoais de um caso antes de versioná-lo: e-mails (trocados de forma consistente no texto e nos campos,
 * para a comparação continuar valendo), o nome de quem postou, perfis e links curtos do LinkedIn, telefones e os ids e links do post.
 * Nomes citados no meio do texto e o próprio texto (que acha o post numa busca) continuam: o caso sai com
 * `anonymized: false` até ser reescrito à mão.
 */
export function anonymizeCase(item: ExtractionCase): ExtractionCase {
	const emails = new Map<string, string>()
	const authorNames = nameVariants(item.post.author)

	const scrub = (text: string) => {
		let result = text.replace(EMAIL, email => {
			const key = email.toLowerCase()
			if (PLACEHOLDER_EMAIL.test(key)) return email
			if (!emails.has(key)) emails.set(key, `contato${emails.size + 1}@exemplo.com`)
			return emails.get(key)!
		})
		result = result
			.replace(LINKEDIN_PROFILE, 'linkedin.com/in/perfil')
			.replace(LINKEDIN_SHORT_LINK, 'lnkd.in/link')
			.replace(PHONE, '(11) 90000-0000')
		for (const name of authorNames) result = result.replace(wordPattern(name), PLACEHOLDER_AUTHOR)
		return result
	}
	const scrubFields = <T extends Record<string, unknown>>(fields: T): T =>
		Object.fromEntries(
			Object.entries(fields).map(([key, value]) => [
				key,
				typeof value === 'string' ? scrub(value) : Array.isArray(value) ? value.map(entry => scrub(String(entry))) : value,
			]),
		) as T

	return {
		...item,
		postId: `caso-${shortHash(item.postId)}`,
		anonymized: false,
		post: {
			text: scrub(item.post.text),
			author: item.post.author ? PLACEHOLDER_AUTHOR : null,
			url: null,
			postedAt: item.post.postedAt,
			// Só importa se existe (vaga de um post com várias): o id em si não
			sourcePostId: item.post.sourcePostId ? 'post-de-origem' : null,
		},
		aiOutput: scrubFields(item.aiOutput),
		expected: item.expected && scrubFields(item.expected),
	}
}

/** Dados pessoais que sobraram num caso já anonimizado (e-mails reais, perfis, links curtos, telefones); vazio se não há nenhum. */
export function findPersonalData(item: ExtractionCase) {
	// Os textos em si, não o JSON: nele, o "\n" antes de um e-mail no começo da linha entraria no e-mail ("ncontato1@...")
	const text = textsOf(item).join('\n')
	const found = [
		...[...text.matchAll(EMAIL)].map(match => match[0]).filter(email => !PLACEHOLDER_EMAIL.test(email.toLowerCase())),
		...[...text.matchAll(LINKEDIN_PROFILE)]
			.map(match => match[0])
			.filter(profile => profile.toLowerCase() !== 'linkedin.com/in/perfil'),
		...[...text.matchAll(LINKEDIN_SHORT_LINK)].map(match => match[0]).filter(link => link !== 'lnkd.in/link'),
		...[...text.matchAll(PHONE)].map(match => match[0]).filter(phone => phone !== '(11) 90000-0000'),
	]
	if (item.post.url) found.push(item.post.url)

	return found
}

function textsOf(value: unknown): string[] {
	if (typeof value === 'string') return [value]
	if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf)
	return []
}

/**
 * Junta os casos novos aos já versionados: o mesmo post fica uma vez só, com a versão nova. Um caso já reescrito à
 * mão (`anonymized: true`) fica como está; `kept` lista os ids deles que vieram de novo do export.
 */
export function mergeFixtures(current: ExtractionCase[], added: ExtractionCase[]) {
	const byId = new Map(current.map(item => [item.postId, item]))
	const kept: string[] = []
	for (const item of added) {
		if (byId.get(item.postId)?.anonymized) kept.push(item.postId)
		else byId.set(item.postId, item)
	}
	return { fixtures: [...byId.values()], kept }
}

/** O que impede cada caso de ser versionado: texto ainda não reescrito à mão ou dados pessoais. Só casos com problema. */
export function fixtureProblems(fixtures: ExtractionCase[]) {
	return fixtures
		.map(item => ({
			postId: item.postId,
			problems: [...(item.anonymized ? [] : ['anonymized: false']), ...findPersonalData(item)],
		}))
		.filter(item => item.problems.length > 0)
}

/** Lê os casos versionados; arquivo ausente é uma lista vazia. */
export async function readFixtures(path = DEFAULT_FIXTURES_PATH): Promise<ExtractionCase[]> {
	const file = Bun.file(path)
	if (!(await file.exists())) return []

	return ExtractionCaseSchema.array().parse(await file.json())
}

/** O nome completo e o primeiro nome (com 3 letras ou mais), do maior para o menor. */
function nameVariants(author: string | null) {
	const name = author?.trim()
	// Já anonimizado: trocar "Autor" de novo estragaria o texto
	if (!name || name === PLACEHOLDER_AUTHOR) return []

	const first = name.split(/\s+/)[0]!
	return first.length >= 3 && first !== name ? [name, first] : [name]
}

function wordPattern(word: string) {
	return new RegExp(`(?<![\\p{L}\\d])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'giu')
}

function shortHash(value: string) {
	return new Bun.CryptoHasher('sha256').update(value).digest('hex').slice(0, 12)
}
