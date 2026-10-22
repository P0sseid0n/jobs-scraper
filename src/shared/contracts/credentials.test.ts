import { describe, expect, test } from 'bun:test'

import {
	CredentialsSchema,
	credentialStatus,
	DiscordCredentialsSchema,
	GithubCredentialsSchema,
	LinkedinCredentialsSchema,
} from './settings'

describe('CredentialsSchema', () => {
	test('todos os grupos são opcionais', () => {
		expect(CredentialsSchema.parse({})).toEqual({})
	})

	test('normaliza os campos e mantém a senha como veio', () => {
		expect(LinkedinCredentialsSchema.parse({ email: ' eu@exemplo.com ', password: ' segredo ' })).toEqual({
			email: 'eu@exemplo.com',
			password: ' segredo ',
		})
		expect(DiscordCredentialsSchema.parse({ token: ' abc ', channelId: ' 123 ' })).toEqual({ token: 'abc', channelId: '123' })
		expect(GithubCredentialsSchema.parse({ username: 'P0sseid0n' })).toEqual({ username: 'P0sseid0n' })
	})

	test('recusa grupo incompleto ou inválido, com a mensagem de cada campo', () => {
		const result = CredentialsSchema.safeParse({
			linkedin: { email: 'não é e-mail' },
			discord: { token: 'abc', channelId: '#vagas' },
			github: { username: 'nome com espaço' },
		})

		expect(result.success).toBe(false)
		const messages = Object.fromEntries(result.error!.issues.map(issue => [issue.path.join('.'), issue.message]))
		expect(messages).toEqual({
			'linkedin.email': 'Informe um e-mail válido',
			'linkedin.password': 'Informe a senha',
			'discord.channelId': 'Use o ID numérico do canal',
			'github.username': 'Use o nome de usuário do GitHub (letras, números e hífen)',
		})
	})
})

describe('credentialStatus', () => {
	test('mostra os campos públicos e, dos segredos, só se estão preenchidos', () => {
		const status = credentialStatus('linkedin', {
			value: { email: 'eu@exemplo.com', password: 'segredo-123' },
			source: 'database',
		})

		expect(status).toEqual({
			source: 'database',
			values: { email: 'eu@exemplo.com' },
			secrets: { password: true, liAt: false },
		})
		expect(JSON.stringify(status)).not.toContain('segredo-123')
	})

	test('grupo não configurado', () => {
		expect(credentialStatus('github', null)).toEqual({ source: null, values: { username: null }, secrets: { token: false } })
	})
})
