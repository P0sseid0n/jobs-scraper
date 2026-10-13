import { describe, expect, test } from 'bun:test'

import { buildSearchUrl, canonicalJobUrl, externalLink, isAuthPage, isCheckpointPage, safetyRedirectTarget } from './urls'

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

describe('isCheckpointPage', () => {
	test('reconhece só a verificação do login', () => {
		expect(isCheckpointPage('https://www.linkedin.com/checkpoint/challenge/AgF123?ut=x')).toBe(true)
		expect(isCheckpointPage('https://www.linkedin.com/login')).toBe(false)
		expect(isCheckpointPage('https://www.linkedin.com/feed/')).toBe(false)
	})
})

describe('canonicalJobUrl', () => {
	test('limpa a URL de uma vaga do LinkedIn, com ou sem o nome no caminho', () => {
		expect(canonicalJobUrl('https://www.linkedin.com/jobs/view/4012345678/?trk=abc')).toBe(
			'https://www.linkedin.com/jobs/view/4012345678/',
		)
		expect(canonicalJobUrl('https://br.linkedin.com/jobs/view/dev-vue-at-acme-4012345678')).toBe(
			'https://www.linkedin.com/jobs/view/4012345678/',
		)
	})

	test('não é vaga do LinkedIn', () => {
		expect(canonicalJobUrl('https://www.linkedin.com/feed/')).toBeNull()
		expect(canonicalJobUrl('https://empresa.com/jobs/view/123')).toBeNull()
	})
})

describe('safetyRedirectTarget', () => {
	test('lê o destino do aviso de link externo', () => {
		expect(safetyRedirectTarget('https://www.linkedin.com/safety/go?url=https%3A%2F%2Fempresa.com%2Fvaga&trk=x')).toBe(
			'https://empresa.com/vaga',
		)
		expect(safetyRedirectTarget('https://www.linkedin.com/jobs/view/1/')).toBeNull()
		expect(safetyRedirectTarget('https://empresa.com/safety/go?url=x')).toBeNull()
	})
})

describe('externalLink', () => {
	test('tira o aviso de link externo do LinkedIn (cartão de pré-visualização)', () => {
		const card =
			'https://www.linkedin.com/safety/go/?url=http%3A%2F%2Fvagasbr%2Eempregonaweb%2Ecom%2Fbanco-de-talentos%2F&urlhash=x&isSdui=true'

		expect(externalLink(['https://www.linkedin.com/company/vagas-brs/', card])).toBe(
			'http://vagasbr.empregonaweb.com/banco-de-talentos/',
		)
	})

	test('aceita link direto para fora e o encurtador lnkd.in', () => {
		expect(externalLink(['https://empresa.com/vagas/1'])).toBe('https://empresa.com/vagas/1')
		expect(externalLink(['https://lnkd.in/dVZKNZdw'])).toBe('https://lnkd.in/dVZKNZdw')
	})

	test('ignora links internos do LinkedIn e o que não é http', () => {
		expect(
			externalLink([
				'https://www.linkedin.com/in/fulano/',
				'https://www.linkedin.com/feed/hashtag/vagas',
				'mailto:rh@empresa.com',
				'nao é url',
			]),
		).toBeNull()
	})
})
