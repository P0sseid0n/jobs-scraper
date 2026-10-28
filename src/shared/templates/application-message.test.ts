import { describe, expect, test } from 'bun:test'

import { applicationMessage, formatApplicationMessage } from './application-message'

describe('formatApplicationMessage', () => {
	const message = { subject: 'Candidatura – Dev', body: 'Olá! Tudo bem?\n\nVi a vaga.' }

	test('assunto, linha em branco e corpo', () => {
		expect(formatApplicationMessage(message)).toBe('Assunto: Candidatura – Dev\n\nOlá! Tudo bem?\n\nVi a vaga.')
	})

	test('a assinatura vai no fim, como está, depois de uma linha em branco', () => {
		const signature = '🔗 GitHub: https://github.com/exemplo\n💼 LinkedIn: https://linkedin.com/in/exemplo'

		expect(formatApplicationMessage(message, `  ${signature}\n`)).toEndWith(`Vi a vaga.\n\n${signature}`)
		expect(formatApplicationMessage(message, '   ')).toEndWith('Vi a vaga.')
	})

	test('o modelo padrão também leva a assinatura', () => {
		expect(applicationMessage('Dev', 'GitHub: https://github.com/exemplo')).toEndWith(
			'Obrigado!\n\nGitHub: https://github.com/exemplo',
		)
	})
})
