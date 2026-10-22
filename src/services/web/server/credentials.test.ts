import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { createLogger } from '@shared/logging'
import { setEnvCredentials } from '@shared/settings'

import { checkDiscord, checkGithub } from './credential-checks'
import { handler } from './http'

// A coleção `settings` em memória: a rota passa pelo credentials-store e pelos schemas de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../../../shared/database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async ({ _id }: { _id: string }, document: { values: Record<string, unknown> }) => {
			stored.set(_id, document)
		},
	},
}))

const { getCredentials, putCredentials, removeCredentials, testCredentials } = await import('./credentials')

const logger = createLogger('test')
logger.level = 'silent'

const get = handler(logger, getCredentials)
const put = handler(logger, putCredentials)
const remove = handler(logger, removeCredentials)
const check = handler(logger, testCredentials)

const SECRETS = ['senha-do-site', 'senha-do-env', 'li-at-do-site', 'token-do-bot', 'ghp_token']

function request(group: string, method = 'PUT', body?: unknown) {
	const req = new Request(`http://localhost/api/credentials/${group}`, {
		method,
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	return Object.assign(req, { params: { group } })
}

/** O corpo da resposta, conferindo que nenhum segredo aparece nele. */
async function bodyOf(response: Response) {
	const text = await response.text()
	for (const secret of SECRETS) expect(text).not.toContain(secret)

	return JSON.parse(text)
}

beforeEach(() => {
	stored.clear()
	setEnvCredentials({})
})

describe('/api/credentials', () => {
	test('o GET diz de onde vem cada grupo e nunca devolve os segredos', async () => {
		setEnvCredentials({ linkedin: { email: 'env@exemplo.com', password: 'senha-do-env' } })
		await put(request('discord', 'PUT', { token: 'token-do-bot', channelId: '123' }))
		await put(request('github', 'PUT', { username: 'P0sseid0n', token: 'ghp_token' }))

		const body = await bodyOf(await get(new Request('http://localhost/api/credentials')))

		expect(body).toEqual({
			linkedin: { source: 'env', values: { email: 'env@exemplo.com' }, secrets: { password: true, liAt: false } },
			discord: { source: 'database', values: { channelId: '123' }, secrets: { token: true } },
			github: { source: 'database', values: { username: 'P0sseid0n' }, secrets: { token: true } },
		})
	})

	test('o PUT salva no banco e devolve o estado sem os segredos', async () => {
		const response = await put(
			request('linkedin', 'PUT', { email: 'site@exemplo.com', password: 'senha-do-site', liAt: 'li-at-do-site' }),
		)

		expect(response.status).toBe(200)
		expect((await bodyOf(response)).linkedin).toEqual({
			source: 'database',
			values: { email: 'site@exemplo.com' },
			secrets: { password: true, liAt: true },
		})
		expect(stored.get('credentials')?.values.linkedin).toEqual({
			email: 'site@exemplo.com',
			password: 'senha-do-site',
			liAt: 'li-at-do-site',
		})
	})

	test('campo inválido vira 400 com o erro do campo, sem o valor, e nada é salvo', async () => {
		const response = await put(request('linkedin', 'PUT', { email: 'senha-do-site', password: '' }))
		const body = await bodyOf(response)

		expect(response.status).toBe(400)
		expect(body.fields).toEqual({ email: 'Informe um e-mail válido', password: 'Informe a senha' })
		expect(stored.has('credentials')).toBe(false)
	})

	test('o DELETE apaga o grupo do banco e volta a valer o .env', async () => {
		setEnvCredentials({ linkedin: { email: 'env@exemplo.com', password: 'senha-do-env' } })
		await put(request('linkedin', 'PUT', { email: 'site@exemplo.com', password: 'senha-do-site' }))

		const body = await bodyOf(await remove(request('linkedin', 'DELETE')))

		expect(body.linkedin).toMatchObject({ source: 'env', values: { email: 'env@exemplo.com' } })
	})

	test('grupo desconhecido vira 404; corpo que não é objeto de textos, 400', async () => {
		expect((await put(request('twitter', 'PUT', {}))).status).toBe(404)
		expect((await put(request('github', 'PUT', ['P0sseid0n']))).status).toBe(400)
		expect((await put(request('github', 'PUT', { username: 123 }))).status).toBe(400)
	})

	test('o LinkedIn não tem teste', async () => {
		expect((await check(request('linkedin', 'POST'))).status).toBe(404)
	})

	test('testar sem credenciais vira 400 com os campos que faltam', async () => {
		const response = await check(request('discord', 'POST'))

		expect(response.status).toBe(400)
		expect((await bodyOf(response)).fields).toHaveProperty('token')
	})
})

/** Um `fetch` que responde pela rota pedida e guarda as requisições. */
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
	const calls: { url: string; init?: RequestInit }[] = []
	const fetchFn = async (url: string, init?: RequestInit) => {
		calls.push({ url, init })
		const route = routes[new URL(url).pathname] ?? { status: 404 }
		return Response.json(route.body ?? {}, { status: route.status })
	}

	return { fetchFn, calls }
}

describe('checkDiscord', () => {
	const account = { token: 'token-do-bot', channelId: '123' }

	test('token e canal de texto válidos', async () => {
		const { fetchFn, calls } = fakeFetch({
			'/api/v10/users/@me': { status: 200, body: { username: 'vagas-bot' } },
			'/api/v10/channels/123': { status: 200, body: { name: 'vagas', type: 0 } },
		})

		expect(await checkDiscord(account, fetchFn)).toEqual({ ok: true, message: 'Bot vagas-bot com acesso ao canal #vagas.' })
		expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bot token-do-bot')
	})

	test('token recusado, canal sem acesso e canal de voz', async () => {
		const me = { status: 200, body: { username: 'vagas-bot' } }

		expect((await checkDiscord(account, fakeFetch({ '/api/v10/users/@me': { status: 401 } }).fetchFn)).ok).toBe(false)

		const noAccess = await checkDiscord(account, fakeFetch({ '/api/v10/users/@me': me }).fetchFn)
		expect(noAccess).toEqual({
			ok: false,
			message: 'Token válido (bot vagas-bot), mas o canal não existe ou o bot não tem acesso a ele.',
		})

		const voice = fakeFetch({ '/api/v10/users/@me': me, '/api/v10/channels/123': { status: 200, body: { name: 'geral', type: 2 } } })
		expect((await checkDiscord(account, voice.fetchFn)).message).toBe('O canal #geral não é de texto nem de fórum.')
	})

	test('falha de rede vira resposta, sem o token', async () => {
		const result = await checkDiscord(account, async () => {
			throw new TypeError('fetch failed')
		})

		expect(result).toEqual({ ok: false, message: 'Não consegui falar com o Discord.' })
	})
})

describe('checkGithub', () => {
	test('usuário encontrado, com e sem token', async () => {
		const routes = { '/users/P0sseid0n': { status: 200, body: { login: 'P0sseid0n', public_repos: 12 } } }

		const withoutToken = fakeFetch(routes)
		expect(await checkGithub({ username: 'P0sseid0n' }, withoutToken.fetchFn)).toEqual({
			ok: true,
			message: 'Usuário P0sseid0n encontrado, com 12 repositórios públicos.',
		})
		expect(new Headers(withoutToken.calls[0]?.init?.headers).has('Authorization')).toBe(false)

		const withToken = fakeFetch(routes)
		expect((await checkGithub({ username: 'P0sseid0n', token: 'ghp_token' }, withToken.fetchFn)).message).toEndWith(
			'e token aceito.',
		)
		expect(new Headers(withToken.calls[0]?.init?.headers).get('Authorization')).toBe('Bearer ghp_token')
	})

	test('usuário que não existe e token recusado', async () => {
		expect(await checkGithub({ username: 'ninguem' }, fakeFetch({}).fetchFn)).toEqual({
			ok: false,
			message: 'O usuário ninguem não existe no GitHub.',
		})
		expect(
			(await checkGithub({ username: 'x', token: 'ghp_token' }, fakeFetch({ '/users/x': { status: 401 } }).fetchFn)).message,
		).toBe('O GitHub recusou o token.')
	})
})
