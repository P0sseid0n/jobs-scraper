import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { parseConfig } from '../config/load-config'
import { credentialsEnv, credentialsFromEnv } from './credentials-env'

// A coleção `settings` em memória: o store passa pelos schemas de verdade
const stored = new Map<string, { values: Record<string, unknown> }>()

mock.module('../database/settings.model', () => ({
	Settings: {
		findById: (id: string) => ({ lean: async () => stored.get(id) ?? null }),
		updateOne: async ({ _id }: { _id: string }, document: { values: Record<string, unknown> }) => {
			stored.set(_id, document)
		},
	},
}))

const { deleteCredentials, loadCredentials, readCredentialsStatus, saveCredentials, setEnvCredentials } =
	await import('./credentials-store')

/** As credenciais como os serviços as leem, a partir de um `.env` parcial. */
function fromEnv(env: Record<string, string>) {
	const config = parseConfig(credentialsEnv, env)
	if (!config.success) throw config.error

	return credentialsFromEnv(config.data)
}

beforeEach(() => {
	stored.clear()
	setEnvCredentials({})
})

describe('credentialsFromEnv', () => {
	test('a conta de e-mail vem das SMTP_*, com porta e remetente opcionais', () => {
		expect(
			fromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '', SMTP_USER: 'eu@gmail.com', SMTP_PASS: 'senha de app', MAIL_FROM: '' }),
		).toEqual({
			smtp: { host: 'smtp.gmail.com', user: 'eu@gmail.com', password: 'senha de app' },
		})
		expect(() => fromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'eu@gmail.com' })).toThrow('SMTP_PASS')
	})

	test('.env vazio (ou com variáveis em branco): nenhum grupo', () => {
		expect(fromEnv({})).toEqual({})
		expect(fromEnv({ LINKEDIN_EMAIL: '', DISCORD_TOKEN: '  ', GITHUB_USERNAME: '' })).toEqual({})
	})

	test('agrupa as variáveis preenchidas', () => {
		expect(
			fromEnv({
				LINKEDIN_EMAIL: 'eu@exemplo.com',
				LINKEDIN_PASSWORD: 'senha',
				LINKEDIN_LI_AT: '',
				DISCORD_TOKEN: 'token-do-bot',
				DISCORD_CHANNEL_ID: '123',
				GITHUB_USERNAME: 'P0sseid0n',
			}),
		).toEqual({
			linkedin: { email: 'eu@exemplo.com', password: 'senha' },
			discord: { token: 'token-do-bot', channelId: '123' },
			github: { username: 'P0sseid0n' },
		})
	})

	test('grupo incompleto: o erro aponta a variável, sem o valor', () => {
		expect(() => fromEnv({ LINKEDIN_EMAIL: 'eu@exemplo.com', DISCORD_TOKEN: 'segredo-do-bot', DISCORD_CHANNEL_ID: 'abc' })).toThrow(
			'Credenciais inválidas no .env (LINKEDIN_PASSWORD: Informe a senha; DISCORD_CHANNEL_ID: Use o ID numérico do canal)',
		)

		try {
			fromEnv({ DISCORD_TOKEN: 'segredo-do-bot', DISCORD_CHANNEL_ID: 'abc' })
		} catch (error) {
			expect((error as Error).message).not.toContain('segredo-do-bot')
		}
	})
})

describe('ordem de leitura: banco, depois .env', () => {
	const envAccount = { email: 'env@exemplo.com', password: 'senha-do-env' }

	test('sem nada no banco, vale o .env', async () => {
		setEnvCredentials({ linkedin: envAccount })

		expect(await loadCredentials('linkedin')).toEqual({ value: envAccount, source: 'env' })
		expect(await loadCredentials('discord')).toBeNull()
	})

	test('o grupo salvo no banco vale no lugar do .env', async () => {
		setEnvCredentials({ linkedin: envAccount })
		await saveCredentials('linkedin', { email: 'site@exemplo.com', password: 'senha-do-site' })

		expect(await loadCredentials('linkedin')).toEqual({
			value: { email: 'site@exemplo.com', password: 'senha-do-site' },
			source: 'database',
		})
	})

	test('apagar o grupo do banco volta para o .env', async () => {
		setEnvCredentials({ linkedin: envAccount })
		await saveCredentials('linkedin', { email: 'site@exemplo.com', password: 'senha-do-site' })
		await deleteCredentials('linkedin')

		expect(await loadCredentials('linkedin')).toEqual({ value: envAccount, source: 'env' })
	})

	test('cada grupo é resolvido à parte', async () => {
		setEnvCredentials({ linkedin: envAccount, github: { username: 'do-env' } })
		await saveCredentials('github', { username: 'do-site' })

		const status = await readCredentialsStatus()
		expect(status.linkedin.source).toBe('env')
		expect(status.github).toMatchObject({ source: 'database', values: { username: 'do-site' } })
		expect(status.discord.source).toBeNull()
	})
})

describe('saveCredentials', () => {
	test('campo ausente mantém o segredo em uso; segredo opcional vazio é apagado', async () => {
		await saveCredentials('github', { username: 'P0sseid0n', token: 'ghp_antigo' })
		await saveCredentials('github', { username: 'outro' })
		expect((await loadCredentials('github'))?.value).toEqual({ username: 'outro', token: 'ghp_antigo' })

		await saveCredentials('github', { token: '' })
		expect((await loadCredentials('github'))?.value).toEqual({ username: 'outro' })
	})

	test('grupo inválido não é salvo', async () => {
		await expect(saveCredentials('discord', { token: 'abc', channelId: 'vagas' })).rejects.toThrow()
		expect(stored.has('credentials')).toBe(false)
	})

	test('grupo inválido no banco dá erro sem os valores', async () => {
		stored.set('credentials', { values: { discord: { token: 'segredo-do-bot', channelId: 'abc' } } })

		const error = await loadCredentials('discord').catch(error => error as Error)
		expect(error).toBeInstanceOf(Error)
		expect((error as Error).message).toContain('channelId')
		expect((error as Error).message).not.toContain('segredo-do-bot')
	})
})
