import { ExtractionCaseSchema, type ExtractionCase } from './extraction-eval'

/** Casos de avaliação versionados, exportados por `bun eval:export-fixtures` e lidos por `bun eval:extraction --fixtures`. */
export const DEFAULT_FIXTURES_PATH = new URL('./fixtures/extraction-cases.json', import.meta.url).pathname

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const LINKEDIN_PROFILE = /linkedin\.com\/in\/[^\s/?#)"]+/gi
// Telefones brasileiros: "(11) 91234-5678", "+55 11 912345678", "11 3456-7890"
const PHONE = /(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g

const PLACEHOLDER_EMAIL = /^contato\d+@exemplo\.com$/
const PLACEHOLDER_AUTHOR = 'Autor do post'

/**
 * Tira os dados pessoais de um caso antes de versioná-lo: e-mails (trocados de forma consistente no texto e nos campos,
 * para a comparação continuar valendo), o nome de quem postou, perfis do LinkedIn, telefones e os ids e links do post.
 * Nomes citados no meio do texto não são detectados: revise o arquivo antes do commit.
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
		result = result.replace(LINKEDIN_PROFILE, 'linkedin.com/in/perfil').replace(PHONE, '(11) 90000-0000')
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

/** Dados pessoais que sobraram num caso já anonimizado (e-mails reais, perfis, telefones); vazio se não há nenhum. */
export function findPersonalData(item: ExtractionCase) {
	const text = JSON.stringify(item)
	const found = [
		...[...text.matchAll(EMAIL)].map(match => match[0]).filter(email => !PLACEHOLDER_EMAIL.test(email.toLowerCase())),
		...[...text.matchAll(LINKEDIN_PROFILE)]
			.map(match => match[0])
			.filter(profile => profile.toLowerCase() !== 'linkedin.com/in/perfil'),
		...[...text.matchAll(PHONE)].map(match => match[0]).filter(phone => phone !== '(11) 90000-0000'),
	]
	if (item.post.url) found.push(item.post.url)

	return found
}

/** Junta os casos novos aos já versionados: o mesmo post fica uma vez só, com a versão nova. */
export function mergeFixtures(current: ExtractionCase[], added: ExtractionCase[]) {
	const byId = new Map(current.map(item => [item.postId, item]))
	for (const item of added) byId.set(item.postId, item)
	return [...byId.values()]
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
