import type { CookieData } from 'puppeteer'

export const BASE_URL = 'https://www.linkedin.com'
export const LOGIN_URL = `${BASE_URL}/login`
export const SEARCH_PATH = '/search/results/content/'

export const DATE_POSTED_FILTERS = ['past-24h', 'past-week', 'past-month', 'any'] as const
export type DatePostedFilter = (typeof DATE_POSTED_FILTERS)[number]

/**
 * Seletores centralizados. Cada um tem alternativas (separadas por vírgula) para sobreviver a pequenas
 * mudanças no HTML do LinkedIn. Se a coleta parar de encontrar posts, comece revisando aqui.
 */
export const SELECTORS = {
	/** Card de um post: layout atual (2026, sem classes estáveis) e o antigo, com `data-urn`. */
	post: '[role="listitem"][componentkey*="update-card"], [data-urn^="urn:li:activity:"], [data-urn^="urn:li:ugcPost:"], [data-urn^="urn:li:share:"]',
	postText:
		'[data-testid="expandable-text-box"], .update-components-text, .update-components-update-v2__commentary, .feed-shared-update-v2__description',
	/** Elementos cujo id/href contém o ID do post (ver `resolvePostUrn`). */
	postIdSources: '[id^="translatable-commentary-"], a[href*="/feed/update/urn"], a[href*="UpdateUrn=urn"], a[href*="urn%3Ali%3A"]',
	/** Link do perfil do autor; o nome é o primeiro link com texto. */
	authorLink: 'a[href*="/in/"], a[href*="/company/"]',
	loadMoreButton: 'button.scaffold-finite-scroll__load-button',
	// A página de login atual (React) não tem id/name estáveis e renderiza o formulário duas vezes
	// (uma cópia oculta): por isso usamos `autocomplete`/`type` e sempre o elemento visível.
	loginUsername: '#username, input[name="session_key"], input[autocomplete~="username"]',
	loginPassword: '#password, input[name="session_password"], input[type="password"]',
} as const

/** Páginas em que o LinkedIn pede login, verificação (captcha/2FA) ou bloqueia o acesso anônimo. */
export function isAuthPage(url: string) {
	const { pathname } = new URL(url, BASE_URL)
	return /^\/(login|authwall|checkpoint|uas\/login|signup)/.test(pathname)
}

export function buildSearchUrl(opts: { keywords: string; datePosted: DatePostedFilter }) {
	// O LinkedIn espera os valores dos filtros entre aspas, ex.: datePosted="past-24h"
	const params = new URLSearchParams({ keywords: opts.keywords, sortBy: '"date_posted"' })
	if (opts.datePosted !== 'any') params.set('datePosted', `"${opts.datePosted}"`)
	return `${BASE_URL}${SEARCH_PATH}?${params}`
}

/**
 * Descobre o URN do post a partir dos ids/links encontrados no card. O layout atual não tem mais `data-urn`:
 * o ID aparece no id da caixa de tradução (`ShareUrn(shareId=…)`, `UserGeneratedContentPostUrn(userGeneratedContentId=…)`,
 * `GroupPostUrn(groupId=…, postId=…)`) ou em links `/feed/update/urn:li:…`.
 */
export function resolvePostUrn(candidates: string[]): string | null {
	const values = candidates.map(value => {
		try {
			return decodeURIComponent(value)
		} catch {
			return value
		}
	})

	for (const value of values) {
		const direct = value.match(/urn:li:(activity|ugcPost|share):(\d+)/)
		if (direct) return `urn:li:${direct[1]}:${direct[2]}`

		const share = value.match(/shareId=(\d+)/)
		if (share) return `urn:li:share:${share[1]}`

		const ugcPost = value.match(/userGeneratedContentId=(\d+)/)
		if (ugcPost) return `urn:li:ugcPost:${ugcPost[1]}`
	}

	// Post de grupo sem link de activity: menos preferido, mas ainda abre em /feed/update/
	for (const value of values) {
		const groupPost = value.match(/groupId=(\d+), postId=(\d+)/)
		if (groupPost) return `urn:li:groupPost:${groupPost[1]}-${groupPost[2]}`
	}

	return null
}

export function postUrlFromUrn(urn: string) {
	return `${BASE_URL}/feed/update/${urn}/`
}

/**
 * Os IDs de post do LinkedIn carregam o timestamp de criação nos 41 bits mais altos (ms desde a epoch).
 * Retorna `null` se o URN não tiver um ID numérico ou se a data extraída não fizer sentido.
 */
export function postedAtFromUrn(urn: string, now = Date.now()): string | null {
	const id = urn.match(/(\d{15,})$/)?.[1]
	if (!id) return null

	const ms = Number(BigInt(id) >> 22n)
	if (ms < Date.UTC(2010, 0, 1) || ms > now + 86_400_000) return null
	return new Date(ms).toISOString()
}

/** Limpa espaços sem colar palavras: mantém quebras de linha (no máximo uma linha em branco seguida). */
export function cleanPostText(text: string) {
	return text
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

/**
 * Converte o conteúdo do arquivo de cookies em cookies do Puppeteer. Aceita o formato atual
 * (lista de cookies do navegador) e o antigo (`{ "li_at": "valor" }`). Ignora cookies sem valor.
 */
export function parseStoredCookies(stored: unknown): CookieData[] {
	if (Array.isArray(stored)) {
		return stored.filter(
			(cookie): cookie is CookieData =>
				typeof cookie?.name === 'string' && typeof cookie?.value === 'string' && cookie.value !== '',
		)
	}

	if (stored && typeof stored === 'object') {
		return Object.entries(stored)
			.filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
			.map(([name, value]) => linkedinCookie(name, value))
	}

	return []
}

export function linkedinCookie(name: string, value: string): CookieData {
	return { name, value, domain: '.linkedin.com', path: '/', secure: true }
}
