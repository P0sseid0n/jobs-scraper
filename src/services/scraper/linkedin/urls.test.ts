import { describe, expect, test } from 'bun:test'

import { buildSearchUrl, isAuthPage } from './urls'

describe('buildSearchUrl', () => {
	test('busca de posts com filtro de data e ordenação', () => {
		const url = new URL(buildSearchUrl({ keywords: 'Front End Vue', datePosted: 'past-24h' }))

		expect(url.pathname).toBe('/search/results/content/')
		expect(url.searchParams.get('keywords')).toBe('Front End Vue')
		expect(url.searchParams.get('datePosted')).toBe('"past-24h"')
		expect(url.searchParams.get('sortBy')).toBe('"date_posted"')
	})

	test('sem filtro de data quando datePosted é "any"', () => {
		expect(new URL(buildSearchUrl({ keywords: 'vue', datePosted: 'any' })).searchParams.has('datePosted')).toBe(false)
	})
})

describe('isAuthPage', () => {
	test('detecta páginas de login/bloqueio', () => {
		expect(isAuthPage('https://www.linkedin.com/login')).toBe(true)
		expect(isAuthPage('https://www.linkedin.com/authwall?trk=x')).toBe(true)
		expect(isAuthPage('https://www.linkedin.com/checkpoint/challenge/123')).toBe(true)
		expect(isAuthPage('https://www.linkedin.com/search/results/content/?keywords=vue')).toBe(false)
	})
})
