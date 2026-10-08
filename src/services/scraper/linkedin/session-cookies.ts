import type { CookieData } from 'puppeteer'

/** Converte o arquivo de cookies (formato atual ou o antigo `{ "li_at": "…" }`) em cookies do Puppeteer, sem os vazios. */
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
