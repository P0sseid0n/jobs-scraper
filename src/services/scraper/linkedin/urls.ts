import type { DatePostedFilter } from '@shared/contracts'

export const BASE_URL = 'https://www.linkedin.com'
export const LOGIN_URL = `${BASE_URL}/login`
const SEARCH_PATH = '/search/results/content/'

/** Diz se a URL é de login, verificação (captcha/2FA) ou bloqueio do LinkedIn. */
export function isAuthPage(url: string) {
	const { pathname } = new URL(url, BASE_URL)
	return /^\/(login|authwall|checkpoint|uas\/login|signup)/.test(pathname)
}

/** Diz se a URL é da verificação do login (captcha, código, aprovação pelo app...). */
export function isCheckpointPage(url: string) {
	return new URL(url, BASE_URL).pathname.startsWith('/checkpoint')
}

/** Diz se a URL é do LinkedIn (onde a sessão e o login valem). */
export function isLinkedInUrl(url: string) {
	const { hostname } = new URL(url)
	return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')
}

/** A URL limpa de uma vaga do LinkedIn (/jobs/view/<id>), sem os parâmetros de rastreio; `null` se não for uma. */
export function canonicalJobUrl(url: string) {
	if (!isLinkedInUrl(url)) return null

	const id = new URL(url).pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1]
	return id ? `${BASE_URL}/jobs/view/${id}/` : null
}

/** O destino de um aviso de link externo do LinkedIn (/safety/go?url=...), ou `null`. */
export function safetyRedirectTarget(url: string) {
	const parsed = new URL(url)
	if (!isLinkedInUrl(url) || !parsed.pathname.startsWith('/safety/go')) return null

	return parsed.searchParams.get('url')
}

export function buildSearchUrl(opts: { keywords: string; datePosted: DatePostedFilter }) {
	// O LinkedIn espera os valores dos filtros entre aspas, ex.: datePosted="past-24h"
	const params = new URLSearchParams({ keywords: opts.keywords, sortBy: '"date_posted"' })
	if (opts.datePosted !== 'any') params.set('datePosted', `"${opts.datePosted}"`)
	return `${BASE_URL}${SEARCH_PATH}?${params}`
}
