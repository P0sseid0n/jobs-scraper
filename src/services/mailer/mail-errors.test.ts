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

	test('login recusado é permanente, com o que conferir', () => {
		const result = classifyMailError(smtpError('EAUTH', 535, 'Invalid login: 535-5.7.8 Username and Password not accepted'))

		expect(result.kind).toBe('permanent')
		expect(result.reason).toContain('recusou o login')
		expect(classifyMailError(smtpError('EENVELOPE', 534)).kind).toBe('permanent')
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
