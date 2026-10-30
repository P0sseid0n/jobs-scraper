import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { parseConfig } from '@shared/config'
import { createLogger } from '@shared/logging'
import { seedSettings, settingsEnv, settingsSeedsFromEnv } from '@shared/settings'

import { handler } from './http'

// A coleção `settings` em memória: a rota passa pelo settings-store e pelos schemas de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../../../shared/database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async (
			{ _id }: { _id: string },
			document: { values: Record<string, unknown> } | { $setOnInsert: { values: Record<string, unknown> } },
		) => {
			if (!('$setOnInsert' in document)) stored.set(_id, document)
			else if (!stored.has(_id)) stored.set(_id, document.$setOnInsert)
		},
	},
}))

const { getSettings, putSettings } = await import('./settings')

const logger = createLogger('test')
logger.level = 'silent'

const get = handler(logger, getSettings)
const put = handler<Request & { params: { key: string } }>(logger, req => putSettings(req, { logger }))

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

describe('valores do .env', () => {
	/** Grava as configurações a partir de um `.env` parcial, como o `startService` faz ao subir. */
	function seedFrom(env: Record<string, string>) {
		const config = parseConfig(settingsEnv, env)
		if (!config.success) throw config.error

		return seedSettings(settingsSeedsFromEnv(config.data))
	}

	afterEach(async () => {
		await seedFrom({})
		stored.clear()
	})

	test('ao subir, o .env preenche as configurações que ainda não existem', async () => {
		await seedFrom({ PROFILE_AREA: 'Enfermagem', PROFILE_TARGET_ROLE: 'Enfermeiro', SEARCH_KEYWORDS: 'Enfermeiro' })

		expect(await (await get(request('profile'))).json()).toMatchObject({ area: 'Enfermagem', targetRole: 'Enfermeiro' })
		expect(await (await get(request('scraper'))).json()).toMatchObject({ searchTerms: [{ term: 'Enfermeiro', enabled: true }] })
	})

	test('as configurações já salvas não mudam', async () => {
		await put(request('profile', { area: 'Marketing', targetRole: 'Analista de Marketing' }))
		await seedFrom({ PROFILE_AREA: 'Enfermagem', PROFILE_TARGET_ROLE: 'Enfermeiro' })

		expect(await (await get(request('profile'))).json()).toMatchObject({ area: 'Marketing', targetRole: 'Analista de Marketing' })
	})

	test('os campos vindos do .env continuam editáveis pelo site', async () => {
		await seedFrom({ PROFILE_AREA: 'Enfermagem', PROFILE_TARGET_ROLE: 'Enfermeiro' })
		const response = await put(request('profile', { targetRole: 'Enfermeiro de UTI' }))

		expect(await response.json()).toMatchObject({ area: 'Enfermagem', targetRole: 'Enfermeiro de UTI' })
	})

	test('documento apagado depois volta a valer o .env, também no PUT', async () => {
		await seedFrom({ PROFILE_AREA: 'Enfermagem', PROFILE_TARGET_ROLE: 'Enfermeiro' })
		stored.delete('profile')

		expect(await (await get(request('profile'))).json()).toMatchObject({ area: 'Enfermagem' })
		expect(await (await put(request('profile', { seniority: 'senior' }))).json()).toMatchObject({
			area: 'Enfermagem',
			seniority: 'senior',
		})
	})

	test('valor do .env que os schemas recusam impede a subida, sem gravar nada', async () => {
		stored.clear()

		await expect(seedFrom({ SCRAPER_MIN_JOBS: '500' })).rejects.toThrow('Valores do .env inválidos para as configurações "scraper"')
		expect(stored.size).toBe(0)
	})
})
