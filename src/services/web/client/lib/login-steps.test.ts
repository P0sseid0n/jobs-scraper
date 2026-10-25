import { describe, expect, test } from 'bun:test'

import { loginProgress } from './login-steps'

const start = { step: 0, verification: false }

describe('loginProgress', () => {
	test('esperando o scraper: só o pedido em andamento, linha vazia', () => {
		expect(loginProgress('pending', start)).toEqual({
			states: ['current', 'upcoming', 'upcoming', 'upcoming'],
			fill: 0,
		})
	})

	test('na confirmação, pedido e entrada concluídos', () => {
		expect(loginProgress('verification', { step: 2, verification: true }).states).toEqual(['done', 'done', 'current', 'upcoming'])
	})

	test('conectado sem confirmação: ela fica pulada; com ela, concluída', () => {
		expect(loginProgress('success', { step: 3, verification: false })).toEqual({
			states: ['done', 'done', 'skipped', 'done'],
			fill: 1,
		})
		expect(loginProgress('success', { step: 3, verification: true }).states).toEqual(['done', 'done', 'done', 'done'])
	})

	test('a falha fica na etapa em que o login estava, pelo menos na entrada', () => {
		expect(loginProgress('failed', { step: 2, verification: true }).states).toEqual(['done', 'done', 'failed', 'upcoming'])
		expect(loginProgress('failed', start)).toEqual({ states: ['done', 'failed', 'upcoming', 'upcoming'], fill: 1 / 3 })
	})
})
