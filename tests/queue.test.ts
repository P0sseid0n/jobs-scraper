import { describe, expect, test } from 'bun:test'
import { decideOnFailure, PermanentError } from '../src/utils/queue'

const opts = { maxRetries: 3, retryDelayMs: 1_000 }

describe('decideOnFailure', () => {
	test('erros transitórios são reagendados com backoff exponencial', () => {
		expect(decideOnFailure(new Error('timeout'), 0, opts)).toEqual({ action: 'retry', delayMs: 1_000 })
		expect(decideOnFailure(new Error('timeout'), 2, opts)).toEqual({ action: 'retry', delayMs: 4_000 })
	})

	test('vai para a DLQ quando as tentativas acabam', () => {
		expect(decideOnFailure(new Error('timeout'), 3, opts)).toEqual({ action: 'dead-letter' })
	})

	test('erros permanentes vão direto para a DLQ', () => {
		expect(decideOnFailure(new PermanentError('payload inválido'), 0, opts)).toEqual({ action: 'dead-letter' })
	})
})
