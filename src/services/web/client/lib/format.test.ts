import { describe, expect, test } from 'bun:test'

import { formatDuration, formatInterval, isLoginFailure, jobSubtitle, languageLabel, safeLink, timeAgo, workModeOf } from './format'

describe('jobSubtitle', () => {
	test('empresa · local, sem rótulos vazios', () => {
		expect(jobSubtitle({ company: 'Acme', location: 'São Paulo, SP', author: 'Ana' })).toBe('Acme · São Paulo, SP')
		expect(jobSubtitle({ company: null, location: 'Recife, PE', author: 'Ana' })).toBe('Recife, PE')
	})

	test('sem empresa nem local, quem publicou', () => {
		expect(jobSubtitle({ company: null, location: null, author: 'Ana' })).toBe('post de Ana')
		expect(jobSubtitle({ company: null, location: null, author: null })).toBe('')
	})
})

test('modalidade com rótulo e a cor do Discord', () => {
	expect(workModeOf({ workMode: 'hibrido' })).toEqual({ label: 'Híbrido', color: '#3498db' })
	expect(workModeOf({ workMode: null }).label).toBe('Sem modalidade')
})

test('timeAgo relativo em português', () => {
	const now = new Date('2026-10-10T12:00:00.000Z').getTime()

	expect(timeAgo('2026-10-10T11:59:30.000Z', now)).toBe('agora')
	expect(timeAgo('2026-10-10T09:00:00.000Z', now)).toBe('há 3 h')
	expect(timeAgo('2026-10-09T10:00:00.000Z', now)).toBe('ontem')
})

test('formatDuration', () => {
	expect(formatDuration(38_000)).toBe('38s')
	expect(formatDuration(252_000)).toBe('4min 12s')
	expect(formatDuration(80 * 60_000)).toBe('1h 20min')
	expect(formatDuration(-5)).toBe('0s')
})

test('formatInterval', () => {
	expect(formatInterval(30)).toBe('a cada 30 min')
	expect(formatInterval(240)).toBe('a cada 4 h')
	expect(formatInterval(90)).toBe('a cada 1 h 30 min')
	expect(formatInterval(2 * 24 * 60)).toBe('a cada 2 dias')
})

test('idiomas com nome legível', () => {
	expect(languageLabel('pt')).toBe('Português (pt)')
	expect(languageLabel('nl')).toBe('nl')
})

test('só links http(s) viram botão', () => {
	expect(safeLink('https://www.linkedin.com/feed/update/1')).toBe('https://www.linkedin.com/feed/update/1')
	expect(safeLink('javascript:alert(1)')).toBeNull()
	expect(safeLink(null)).toBeNull()
})

test('falha de login do LinkedIn pede ação', () => {
	expect(isLoginFailure('Login não concluído (checkpoint). O LinkedIn pediu verificação (captcha/2FA)')).toBe(true)
	expect(isLoginFailure('Todas as buscas falharam')).toBe(false)
	expect(isLoginFailure(null)).toBe(false)
})
