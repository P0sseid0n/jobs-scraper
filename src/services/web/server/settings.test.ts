import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { createLogger } from '@shared/logging'

import { handler } from './http'

// A coleção `settings` em memória: a rota passa pelo settings-store e pelos schemas de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../../../shared/database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async ({ _id }: { _id: string }, document: { values: Record<string, unknown> }) => {
			stored.set(_id, document)
		},
	},
}))

const { getSettings, putSettings } = await import('./settings')

const logger = createLogger('test')
logger.level = 'silent'

const get = handler(logger, getSettings)
const put = handler(logger, putSettings)

function request(key: string, body?: unknown) {
	const req = new Request(`http://localhost/api/settings/${key}`, {
		method: body === undefined ? 'GET' : 'PUT',
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	return Object.assign(req, { params: { key } })
}

beforeEach(() => stored.clear())

describe('/api/settings/profile', () => {
	test('sem perfil salvo, o GET devolve o perfil vazio sem criar o documento', async () => {
		const response = await get(request('profile'))

		expect(await response.json()).toEqual({ seniority: null, languages: ['pt'] })
		expect(stored.has('profile')).toBe(false)
	})

	test('o PUT salva o perfil normalizado e o GET passa a devolvê-lo', async () => {
		const response = await put(request('profile', { area: ' Enfermagem ', targetRole: 'Enfermeira', languages: ['PT'] }))
		const expected = { area: 'Enfermagem', targetRole: 'Enfermeira', seniority: null, languages: ['pt'] }

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual(expected)
		expect(await (await get(request('profile'))).json()).toEqual(expected)
	})

	test('o PUT altera só os campos enviados', async () => {
		await put(request('profile', { area: 'Marketing', targetRole: 'Analista de Marketing' }))
		const response = await put(request('profile', { seniority: 'junior' }))

		expect(await response.json()).toMatchObject({ area: 'Marketing', targetRole: 'Analista de Marketing', seniority: 'junior' })
	})

	test('campo inválido vira 400 com o erro do campo, e nada é salvo', async () => {
		await put(request('profile', { area: 'Marketing', targetRole: 'Analista de Marketing' }))
		const response = await put(request('profile', { area: '  ', seniority: 'chefe' }))
		const body = (await response.json()) as { fields: Record<string, string> }

		expect(response.status).toBe(400)
		expect(body.fields.area).toBe('Informe a área')
		expect(body.fields).toHaveProperty('seniority')
		expect(stored.get('profile')?.values).toMatchObject({ area: 'Marketing', seniority: null })
	})

	test('corpo que não é objeto vira 400; chave desconhecida, 404', async () => {
		expect((await put(request('profile', ['Marketing']))).status).toBe(400)
		expect((await get(request('perfil'))).status).toBe(404)
	})
})
