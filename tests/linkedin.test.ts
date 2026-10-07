import { describe, expect, test } from 'bun:test'
import {
	buildSearchUrl,
	cleanPostText,
	isAuthPage,
	parseStoredCookies,
	postedAtFromUrn,
	postUrlFromUrn,
	resolvePostUrn,
} from '../src/services/scraper/linkedin'

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

describe('URN do post', () => {
	test('monta o link do post', () => {
		expect(postUrlFromUrn('urn:li:activity:7058939392341180416')).toBe(
			'https://www.linkedin.com/feed/update/urn:li:activity:7058939392341180416/',
		)
	})

	test('extrai a data de publicação do ID', () => {
		expect(postedAtFromUrn('urn:li:activity:7058939392341180416')).toBe('2023-05-01T23:04:59.886Z')
	})

	test('retorna null para URNs sem ID válido', () => {
		expect(postedAtFromUrn('urn:li:activity:abc')).toBeNull()
		expect(postedAtFromUrn('urn:li:activity:123456789012345')).toBeNull()
	})
})

describe('cleanPostText', () => {
	test('mantém quebras de linha e não cola palavras', () => {
		expect(cleanPostText('  Requisitos:\n  Vue \t e  React\n\n\n\nRemoto ')).toBe('Requisitos:\nVue e React\n\nRemoto')
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

describe('parseStoredCookies', () => {
	test('aceita o formato antigo e ignora valores vazios', () => {
		expect(parseStoredCookies({ li_at: 'abc', JSESSIONID: '' })).toEqual([
			{ name: 'li_at', value: 'abc', domain: '.linkedin.com', path: '/', secure: true },
		])
	})

	test('aceita a lista de cookies do navegador', () => {
		const cookies = [
			{ name: 'li_at', value: 'abc', domain: '.www.linkedin.com', path: '/' },
			{ name: 'vazio', value: '' },
		]
		expect(parseStoredCookies(cookies)).toEqual([cookies[0]] as never)
	})

	test('retorna lista vazia para conteúdo inesperado', () => {
		expect(parseStoredCookies(null)).toEqual([])
		expect(parseStoredCookies('texto')).toEqual([])
	})
})

describe('resolvePostUrn', () => {
	test('extrai o URN do id da caixa de tradução (layout atual)', () => {
		const shareId =
			'translatable-commentary-FeTranslationUrn(contentUrnCommentUrn=null, contentUrnGroupPostUrn=null, contentUrnShareUrn=ContentUrnShareUrn(shareUrn=ShareUrn(shareId=7513649051440021505)), contentUrnUgcPostUrn=null)'
		const ugcPost =
			'translatable-commentary-FeTranslationUrn(contentUrnShareUrn=null, contentUrnUgcPostUrn=ContentUrnUgcPostUrn(userGeneratedContentPostUrn=UserGeneratedContentPostUrn(userGeneratedContentId=7513634933928767488)))'

		expect(resolvePostUrn([shareId])).toBe('urn:li:share:7513649051440021505')
		expect(resolvePostUrn([ugcPost])).toBe('urn:li:ugcPost:7513634933928767488')
	})

	test('prefere o link de activity ao groupPost em posts de grupo', () => {
		const groupPost =
			'translatable-commentary-FeTranslationUrn(contentUrnGroupPostUrn=ContentUrnGroupPostUrn(groupPostUrn=GroupPostUrn(groupId=44194, postId=7513605191817080832)))'
		const link =
			'https://www.linkedin.com/groups/44194/?q=highlightedFeedForGroups&highlightedUpdateUrn=urn:li:activity:7513605192798363648'

		expect(resolvePostUrn([groupPost, link])).toBe('urn:li:activity:7513605192798363648')
		expect(resolvePostUrn([groupPost])).toBe('urn:li:groupPost:44194-7513605191817080832')
	})

	test('aceita data-urn antigo e links codificados', () => {
		expect(resolvePostUrn(['urn:li:activity:7058939392341180416'])).toBe('urn:li:activity:7058939392341180416')
		expect(resolvePostUrn(['/feed/update/urn%3Ali%3AugcPost%3A7483645236414480384/'])).toBe('urn:li:ugcPost:7483645236414480384')
		expect(resolvePostUrn(['https://www.linkedin.com/in/fulano/'])).toBeNull()
	})
})
