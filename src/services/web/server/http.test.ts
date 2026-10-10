import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { createLogger } from '@shared/logging'

import { decodeCursor, encodeCursor, fieldErrors, handler, HttpError, isCrossSiteWrite } from './http'

describe('cursor', () => {
	test('ida e volta', () => {
		const cursor = { at: new Date('2026-10-09T10:00:00.000Z'), id: '6ac9a547e4a3ee550b03ecd3' }
		expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
	})

	test('rejeita cursor adulterado', () => {
		const forged = Buffer.from(JSON.stringify({ at: 'ontem', id: '{"$gt":""}' })).toString('base64url')
		expect(() => decodeCursor(forged)).toThrow(HttpError)
	})
})

test('fieldErrors: a primeira mensagem de cada campo, pelo caminho', () => {
	const schema = z.object({ terms: z.array(z.object({ term: z.string().min(1, 'vazio') })), max: z.number().max(10, 'grande') })
	const result = schema.safeParse({ terms: [{ term: 'ok' }, { term: '' }], max: 50 })

	expect(fieldErrors(result.error!)).toEqual({ 'terms.1.term': 'vazio', max: 'grande' })
})

describe('handler', () => {
	const logger = createLogger('test')
	logger.level = 'silent'
	const req = new Request('http://localhost/api/x')

	test('erro de validação vira 400 com os campos', async () => {
		const response = await handler(logger, () => z.object({ max: z.number() }).parse({ max: 'x' }) as never)(req)

		expect(response.status).toBe(400)
		expect(((await response.json()) as { fields: Record<string, string> }).fields).toHaveProperty('max')
	})

	test('HttpError mantém o status; erro inesperado vira 500 sem vazar a mensagem', async () => {
		expect((await handler(logger, () => Promise.reject(new HttpError(409, 'ocupado')))(req)).status).toBe(409)

		const response = await handler(logger, () => Promise.reject(new Error('senha do banco')))(req)
		expect(response.status).toBe(500)
		expect(await response.text()).not.toContain('senha')
	})
})

test('escritas de outro site são recusadas; leituras e a própria origem passam', () => {
	const url = 'http://localhost:3000/api/scraper/run'

	expect(isCrossSiteWrite(new Request(url, { method: 'POST', headers: { Origin: 'https://evil.example' } }))).toBe(true)
	expect(isCrossSiteWrite(new Request(url, { method: 'POST', headers: { Origin: 'http://localhost:3000' } }))).toBe(false)
	expect(isCrossSiteWrite(new Request(url, { method: 'POST' }))).toBe(false)
	expect(isCrossSiteWrite(new Request(url, { headers: { Origin: 'https://evil.example' } }))).toBe(false)
})
