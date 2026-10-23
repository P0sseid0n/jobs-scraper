import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import type { CredentialsOf } from '@shared/contracts'
import { createLogger } from '@shared/logging'
import { setEnvCredentials } from '@shared/settings'

import type { DiscordLink } from './discord-connection'

// A coleção `settings` em memória: as credenciais passam pelo credentials-store de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../../shared/database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async ({ _id }: { _id: string }, document: { values: Record<string, unknown> }) => {
			stored.set(_id, document)
		},
	},
}))

const { DiscordConnection } = await import('./discord-connection')

const logger = createLogger('test')
logger.level = 'silent'

const ACCOUNT = { token: 'token-do-bot', channelId: '123' }

/** Um bot falso: `connect` devolve este link (ou `null`, como um login recusado) sem acessar o Discord. */
function fakeLink(): DiscordLink {
	return { client: { destroy: async () => {} }, channel: {} } as unknown as DiscordLink
}

function saveDiscord(account: CredentialsOf<'discord'> | null) {
	stored.set('credentials', { values: account ? { discord: account } : {} })
}

let connection: InstanceType<typeof DiscordConnection> | undefined

function createConnection(connect: () => Promise<DiscordLink | null>) {
	connection = new DiscordConnection({ logger, onInteraction: () => {}, connect })
	return connection
}

beforeEach(() => {
	stored.clear()
	setEnvCredentials({})
})

afterEach(async () => {
	await connection?.close()
	connection = undefined
})

describe('DiscordConnection', () => {
	test('sem bot configurado, sobe em espera e responde que não há bot', async () => {
		const connect = mock(async () => fakeLink())
		const discord = createConnection(connect)

		await discord.start()

		expect(await discord.ready()).toBeNull()
		expect(connect).not.toHaveBeenCalled()
	})

	test('conecta quando o token e o canal chegam, sem reiniciar', async () => {
		const link = fakeLink()
		const discord = createConnection(async () => link)
		await discord.start()

		saveDiscord(ACCOUNT)
		await discord.check()

		expect(await discord.ready()).toBe(link)
	})

	test('usa o token e o canal do .env quando o site não salvou', async () => {
		setEnvCredentials({ discord: ACCOUNT })
		const link = fakeLink()
		const connect = mock(async () => link)
		const discord = createConnection(connect)

		await discord.start()

		expect(await discord.ready()).toBe(link)
		expect(connect).toHaveBeenCalledWith(ACCOUNT, 'env')
	})

	test('com as credenciais recusadas, espera outras em vez de descartar', async () => {
		saveDiscord(ACCOUNT)
		const link = fakeLink()
		let accepted = false
		const discord = createConnection(async () => (accepted ? link : null))
		await discord.start()

		const pending = discord.ready()
		accepted = true
		saveDiscord({ ...ACCOUNT, token: 'outro-token' })
		await discord.check()

		expect(await pending).toBe(link)
	})

	test('apagar o bot libera quem esperava, com a resposta de que não há bot', async () => {
		saveDiscord(ACCOUNT)
		const discord = createConnection(async () => null)
		await discord.start()

		const pending = discord.ready()
		saveDiscord(null)
		await discord.check()

		expect(await pending).toBeNull()
	})
})
