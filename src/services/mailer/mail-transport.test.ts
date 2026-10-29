import { describe, expect, test } from 'bun:test'

import { senderOf, smtpOptions } from './mail-transport'

const account = { user: 'ana@gmail.com', password: 'senha de app' }

describe('senderOf', () => {
	test('sem remetente na conta, o nome do currículo base vem com o usuário', () => {
		expect(senderOf(account, 'Ana Souza')).toBe('"Ana Souza" <ana@gmail.com>')
		expect(senderOf(account, 'Ana "Aninha" Souza')).toBe('"Ana Aninha Souza" <ana@gmail.com>')
	})

	test('o remetente da conta vale no lugar do nome; sem nome (ou sem e-mail no usuário), só o usuário', () => {
		expect(senderOf({ ...account, from: 'Ana <ana@gmail.com>' }, 'Ana Souza')).toBe('Ana <ana@gmail.com>')
		expect(senderOf(account, null)).toBe('ana@gmail.com')
		expect(senderOf({ ...account, user: 'ana', host: 'smtp.empresa.com' }, 'Ana Souza')).toBe('ana')
	})
})

describe('smtpOptions', () => {
	test('sem servidor nem porta, vale o deduzido do usuário na 587 com STARTTLS', () => {
		expect(smtpOptions(account)).toMatchObject({ host: 'smtp.gmail.com', port: 587, secure: false })
		expect(smtpOptions({ ...account, host: 'smtp.empresa.com', port: '465' })).toMatchObject({
			host: 'smtp.empresa.com',
			port: 465,
			secure: true,
		})
	})
})
