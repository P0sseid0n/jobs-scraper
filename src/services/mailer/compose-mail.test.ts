import { describe, expect, test } from 'bun:test'

import { composeMail } from './compose-mail'

const pdf = Buffer.from('%PDF-1.7 currículo')
const file = { fileName: 'Curriculo-Acme-Desenvolvedor-Vue.pdf', pdf }

describe('composeMail', () => {
	test('leva o assunto, o corpo revisado e o PDF anexado, do remetente da conta', () => {
		const mail = composeMail(
			{
				to: 'recrutamento@acme.com.br',
				subject: 'Candidatura – Desenvolvedor Vue',
				body: 'Olá! Tudo bem?\n\nEnvio meu currículo em anexo.\n\nAna Souza\nlinkedin.com/in/ana',
			},
			file,
			'Ana Souza <ana@gmail.com>',
		)

		expect(mail).toEqual({
			from: 'Ana Souza <ana@gmail.com>',
			to: 'recrutamento@acme.com.br',
			subject: 'Candidatura – Desenvolvedor Vue',
			text: 'Olá! Tudo bem?\r\n\r\nEnvio meu currículo em anexo.\r\n\r\nAna Souza\r\nlinkedin.com/in/ana',
			attachments: [{ filename: 'Curriculo-Acme-Desenvolvedor-Vue.pdf', content: pdf, contentType: 'application/pdf' }],
		})
	})

	test('o assunto fica numa linha só: uma quebra estragaria o cabeçalho', () => {
		const mail = composeMail({ to: 'rh@acme.com', subject: 'Candidatura\r\nBcc: outro@x.com', body: 'Oi' }, file, 'eu@x.com')

		expect(mail.subject).toBe('Candidatura Bcc: outro@x.com')
		expect(mail.subject).not.toMatch(/[\r\n]/)
	})

	test('corpo que já vem com CRLF não ganha \\r a mais', () => {
		expect(composeMail({ to: 'rh@acme.com', subject: 'A', body: 'a\r\nb' }, file, 'eu@x.com').text).toBe('a\r\nb')
	})
})
