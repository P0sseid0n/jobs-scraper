import { describe, expect, test } from 'bun:test'

import { formatApplicationMessage } from './application-message'

describe('formatApplicationMessage', () => {
	const message = { subject: 'Candidatura – Dev', body: 'Olá! Tudo bem?\n\nVi a vaga.' }

	test('assunto, linha em branco e corpo', () => {
		expect(formatApplicationMessage(message)).toBe('Assunto: Candidatura – Dev\n\nOlá! Tudo bem?\n\nVi a vaga.')
	})
})
