import { describe, expect, test } from 'bun:test'

import {
	CredentialsSchema,
	credentialStatus,
	DiscordCredentialsSchema,
	GithubCredentialsSchema,
	LinkedinCredentialsSchema,
	isMicrosoftPersonalAccount,
	SmtpCredentialsSchema,
	smtpHostOf,
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

describe('SmtpCredentialsSchema', () => {
	test('nos provedores conhecidos, o servidor é deduzido do domínio do usuário', () => {
		const account = SmtpCredentialsSchema.parse({ host: '', user: 'Ana@Gmail.com', password: 'senha de app' })
		expect(account).toEqual({ user: 'Ana@Gmail.com', password: 'senha de app' })
		expect(smtpHostOf(account)).toBe('smtp.gmail.com')
		expect(smtpHostOf({ user: 'ana@yahoo.com.br' })).toBe('smtp.mail.yahoo.com')
	})

	test('o servidor informado vale no lugar do deduzido', () => {
		expect(smtpHostOf({ host: 'smtp.empresa.com.br', user: 'ana@gmail.com' })).toBe('smtp.empresa.com.br')
	})

	test('domínio desconhecido (ou usuário sem e-mail) pede o servidor', () => {
		const issues = (user: string) =>
			SmtpCredentialsSchema.safeParse({ user, password: 'x' }).error?.issues.map(issue => [issue.path.join('.'), issue.message])

		expect(issues('ana@empresa.com.br')).toEqual([['host', 'Informe o servidor SMTP: não conheço o de empresa.com.br']])
		expect(issues('ana@outlook.com')).toEqual([
			['host', 'Informe o servidor SMTP, mas a Microsoft não aceita senha no SMTP das contas pessoais (outlook.com): use uma conta do Gmail'],
		])
		expect(issues('ana')).toEqual([['host', 'Informe o servidor SMTP (ou use o e-mail inteiro no usuário, para ele ser deduzido)']])
		expect(SmtpCredentialsSchema.safeParse({ host: 'smtp.empresa.com.br', user: 'ana@empresa.com.br', password: 'x' }).success).toBe(
			true,
		)
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

describe('isMicrosoftPersonalAccount', () => {
	test('reconhece as contas pessoais da Microsoft pelo domínio do usuário ou pelo servidor', () => {
		for (const user of ['ana@outlook.com', 'Ana@Hotmail.com', 'ana@live.com', 'ana@msn.com', 'ana@hotmail.com.br']) {
			expect(isMicrosoftPersonalAccount({ user })).toBe(true)
		}
		expect(isMicrosoftPersonalAccount({ user: 'ana@empresa.com', host: 'smtp-mail.outlook.com' })).toBe(true)
	})

	test('o Gmail e as contas de trabalho com domínio próprio (Microsoft 365) ficam de fora', () => {
		expect(isMicrosoftPersonalAccount({ user: 'ana@gmail.com' })).toBe(false)
		expect(isMicrosoftPersonalAccount({ user: 'ana@empresa.com.br', host: 'smtp.office365.com' })).toBe(false)
		expect(isMicrosoftPersonalAccount({})).toBe(false)
	})
})
