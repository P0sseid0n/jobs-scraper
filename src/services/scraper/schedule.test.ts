import { describe, expect, test } from 'bun:test'

import { jobsPerTerm, nextRunAt, rankTerms, waitingReason, widerDatePosted } from './schedule'

describe('jobsPerTerm', () => {
	test('divide o limite exato entre os termos, com o resto nos primeiros', () => {
		expect(jobsPerTerm(50, 1)).toEqual([50])
		expect(jobsPerTerm(50, 3)).toEqual([17, 17, 16])
		expect(jobsPerTerm(50, 7).reduce((total, limit) => total + limit, 0)).toBe(50)
	})

	test('com mais termos que posts, os últimos ficam com 0', () => {
		expect(jobsPerTerm(2, 5)).toEqual([1, 1, 0, 0, 0])
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

	test('cada coleta seguida abaixo do mínimo dobra o intervalo, até 4 vezes', () => {
		const last = new Date('2026-10-07T10:00:00Z')

		expect(nextRunAt(last, 60, 1).toISOString()).toBe('2026-10-07T12:00:00.000Z')
		expect(nextRunAt(last, 60, 2).toISOString()).toBe('2026-10-07T14:00:00.000Z')
		expect(nextRunAt(last, 60, 5).toISOString()).toBe('2026-10-07T14:00:00.000Z')
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

describe('widerDatePosted', () => {
	test('amplia o período um passo por vez, até qualquer data', () => {
		expect(widerDatePosted('past-24h')).toBe('past-week')
		expect(widerDatePosted('past-month')).toBe('any')
		expect(widerDatePosted('any')).toBeNull()
	})
})

describe('rankTerms', () => {
	test('os que mais trouxeram vagas primeiro, e os empates na ordem das configurações', () => {
		const jobs = new Map([
			['a', 1],
			['b', 4],
			['c', 1],
		])

		expect(rankTerms(['a', 'b', 'c'], jobs)).toEqual(['b', 'a', 'c'])
	})

	test('termos sem histórico vêm antes, para mostrarem o que trazem', () => {
		expect(
			rankTerms(
				['a', 'novo', 'b', 'outro'],
				new Map([
					['a', 0],
					['b', 3],
				]),
			),
		).toEqual(['novo', 'outro', 'b', 'a'])
	})
})
