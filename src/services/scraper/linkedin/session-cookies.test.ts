import { describe, expect, test } from 'bun:test'

import { parseStoredCookies } from './session-cookies'

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
