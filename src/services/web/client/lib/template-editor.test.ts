import { describe, expect, test } from 'bun:test'

import { insertVariable, variableAllowedIn } from './template-editor'

describe('insertVariable', () => {
	test('insere na posição do cursor, com o cursor logo depois', () => {
		expect(insertVariable('Vaga na  hoje', 'empresa', { start: 8, end: 8 })).toEqual({
			value: 'Vaga na {{empresa}} hoje',
			cursor: 19,
		})
	})

	test('troca o trecho selecionado', () => {
		expect(insertVariable('Vaga na ACME hoje', 'empresa', { start: 8, end: 12 })).toEqual({
			value: 'Vaga na {{empresa}} hoje',
			cursor: 19,
		})
	})

	test('sem campo focado antes, insere no fim', () => {
		expect(insertVariable('Obrigado, ', 'meu_nome', null)).toEqual({ value: 'Obrigado, {{meu_nome}}', cursor: 22 })
	})

	test('seleção fora do texto (o texto mudou depois) vai para o fim', () => {
		expect(insertVariable('abc', 'cargo', { start: 10, end: 12 })).toEqual({ value: 'abc{{cargo}}', cursor: 12 })
	})
})

describe('variableAllowedIn', () => {
	const link = { type: 'link' } as const
	const text = { type: 'text' } as const

	test('variáveis de link ficam bloqueadas no assunto', () => {
		expect(variableAllowedIn(link, 'subject')).toBe(false)
		expect(variableAllowedIn(link, 'body')).toBe(true)
	})

	test('sem campo focado, o destino é a mensagem: o link vale', () => {
		expect(variableAllowedIn(link, null)).toBe(true)
	})

	test('as de texto valem nos dois campos', () => {
		expect(variableAllowedIn(text, 'subject')).toBe(true)
		expect(variableAllowedIn(text, 'body')).toBe(true)
	})
})
