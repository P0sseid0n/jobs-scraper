import { describe, expect, test } from 'bun:test'

import { classifyMailError } from './mail-errors'

/** Um erro como o nodemailer lança: `code` e, quando o servidor respondeu, `responseCode`. */
function smtpError(code: string, responseCode?: number, message = 'erro') {
	return Object.assign(new Error(message), { code, responseCode })
}

describe('classifyMailError', () => {
	test('erros de rede e tempo esgotado são transitórios (vão para o retry)', () => {
		for (const code of ['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'EDNS']) {
			expect(classifyMailError(smtpError(code)).kind).toBe('transient')
		}
	})

	test('resposta 4xx do servidor (ocupado, limite por minuto) é transitória', () => {
		expect(classifyMailError(smtpError('EENVELOPE', 451))).toEqual({
			kind: 'transient',
			reason: 'O servidor de e-mail pediu para tentar mais tarde (SMTP 451).',
		})
		expect(classifyMailError(smtpError('EMESSAGE', 421)).kind).toBe('transient')
	})

	test('login recusado é permanente, com o código SMTP e o que conferir, sem a resposta do servidor', () => {
		const result = classifyMailError(
			smtpError('EAUTH', 535, 'Invalid login: 535 5.7.3 Authentication unsuccessful for ana@empresa.com.br'),
		)

		expect(result).toEqual({
			kind: 'permanent',
			reason:
				'O servidor SMTP recusou o login (SMTP 535 5.7.3): confira o usuário e a senha (de app, no Gmail) da conta de e-mail.',
		})
		expect(classifyMailError(smtpError('EENVELOPE', 534)).kind).toBe('permanent')
		expect(classifyMailError(smtpError('EAUTH')).reason).toStartWith('O servidor SMTP recusou o login:')
	})

	test('a conta pessoal da Microsoft (535 5.7.139) explica que a senha não é aceita e sugere o Gmail', () => {
		// As duas respostas que o smtp-mail.outlook.com dá
		const responses = [
			'535 5.7.139 Authentication unsuccessful, basic authentication is disabled. [CP4P284CA0071.BRAP284.PROD.OUTLOOK.COM]',
			'535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Mailbox. Visit https://aka.ms/smtp_auth_disabled for more information.',
		]

		for (const response of responses) {
			const result = classifyMailError(Object.assign(smtpError('EAUTH', 535, `Invalid login: ${response}`), { response }))
			expect(result.kind).toBe('permanent')
			expect(result.reason).toStartWith('A Microsoft não aceita senha, nem senha de app, no SMTP das contas pessoais')
			expect(result.reason).toContain('(SMTP 535 5.7.139)')
			expect(result.reason).toContain('Gmail')
			expect(result.reason).not.toContain('OUTLOOK.COM')
		}
	})

	test('o Gmail recusando a senha normal (535 5.7.8) pede a senha de app, com o link', () => {
		const response =
			'535-5.7.8 Username and Password not accepted. For more information, go to 535 5.7.8  https://support.google.com/mail/?p=BadCredentials a1-20020a05 - gsmtp'

		expect(classifyMailError(Object.assign(smtpError('EAUTH', 535, `Invalid login: ${response}`), { response }))).toEqual({
			kind: 'permanent',
			reason:
				'O Gmail recusou o login (SMTP 535 5.7.8): ele só aceita senha de app aqui, não a senha normal da conta. Crie uma em https://myaccount.google.com/apppasswords.',
		})
	})

	test('endereço recusado (5xx) é permanente e não repete o endereço nem a resposta do servidor', () => {
		const error = smtpError(
			'EENVELOPE',
			550,
			"Can't send mail - all recipients were rejected: 550 5.1.1 <rh@acme.com>: User unknown",
		)
		const result = classifyMailError(error)

		expect(result.kind).toBe('permanent')
		expect(result.reason).toBe('O servidor recusou o endereço do destinatário (SMTP 550). Confira o e-mail do recrutador.')
		expect(result.reason).not.toContain('rh@acme.com')
	})

	test('mensagem recusada por outro motivo (5xx) também é permanente', () => {
		expect(classifyMailError(smtpError('EMESSAGE', 552))).toEqual({
			kind: 'permanent',
			reason: 'O servidor de e-mail recusou a mensagem (SMTP 552).',
		})
	})

	test('envelope inválido sem resposta do servidor é permanente', () => {
		expect(classifyMailError(smtpError('EENVELOPE')).kind).toBe('permanent')
	})

	test('o que não dá para reconhecer conta como transitório (as tentativas acabam do mesmo jeito)', () => {
		expect(classifyMailError(new Error('???')).kind).toBe('transient')
		expect(classifyMailError(undefined).kind).toBe('transient')
	})
})
