import { describe, expect, test } from 'bun:test'

import { nextRunAt, postsPerTerm, waitingReason } from './schedule'

describe('postsPerTerm', () => {
	test('divide o limite exato entre os termos, com o resto nos primeiros', () => {
		expect(postsPerTerm(50, 1)).toEqual([50])
		expect(postsPerTerm(50, 3)).toEqual([17, 17, 16])
		expect(postsPerTerm(50, 7).reduce((total, limit) => total + limit, 0)).toBe(50)
	})

	test('com mais termos que posts, os últimos ficam com 0', () => {
		expect(postsPerTerm(2, 5)).toEqual([1, 1, 0, 0, 0])
	})
})

describe('nextRunAt', () => {
	test('sem coleta anterior, já está na hora', () => {
		expect(nextRunAt(null, 60).getTime()).toBeLessThanOrEqual(Date.now())
	})

	test('intervalo contado a partir do início da última coleta', () => {
		const last = new Date('2026-10-07T10:00:00Z')

		expect(nextRunAt(last, 90).toISOString()).toBe('2026-10-07T11:30:00.000Z')
	})
})

describe('waitingReason', () => {
	const ready = { paused: false, activeSearchTerms: 2, hasAccount: true }

	test('com termos e conta, as coletas seguem o intervalo', () => {
		expect(waitingReason(ready)).toBeNull()
	})

	test('sem conta do LinkedIn, espera a configuração', () => {
		expect(waitingReason({ ...ready, hasAccount: false })).toBe('no-account')
	})

	test('sem termos, espera os termos antes da conta', () => {
		expect(waitingReason({ ...ready, activeSearchTerms: 0, hasAccount: false })).toBe('no-terms')
	})

	test('numa instalação nova, espera a primeira coleta ser pedida', () => {
		expect(waitingReason({ ...ready, awaitingFirstRun: true })).toBe('first-run')
	})

	test('a configuração que falta vale antes da primeira coleta', () => {
		expect(waitingReason({ ...ready, hasAccount: false, awaitingFirstRun: true })).toBe('no-account')
	})

	test('pausa vale antes de tudo', () => {
		expect(waitingReason({ paused: true, activeSearchTerms: 0, hasAccount: false })).toBe('paused')
	})
})
