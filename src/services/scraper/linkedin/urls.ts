import type { DatePostedFilter } from '@shared/contracts'

export const BASE_URL = 'https://www.linkedin.com'
export const LOGIN_URL = `${BASE_URL}/login`
const SEARCH_PATH = '/search/results/content/'

/** Diz se a URL é de login, verificação (captcha/2FA) ou bloqueio do LinkedIn. */
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
