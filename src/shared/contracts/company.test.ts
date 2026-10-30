import { describe, expect, test } from 'bun:test'

import { blockingCompany, normalizeCompany } from './company'

describe('normalizeCompany', () => {
	test('ignora caixa, acentos, pontuação e sufixos', () => {
		expect(normalizeCompany('ACME Tecnologia Ltda.')).toBe('acme tecnologia')
		expect(normalizeCompany('Ácme Tecnologia S.A.')).toBe('acme tecnologia')
		expect(normalizeCompany(null)).toBeNull()
	})
})

describe('blockingCompany', () => {
	test('casa pela sequência de palavras inteiras, devolvendo a empresa como está na lista', () => {
		expect(blockingCompany('Banco Itaú S.A.', ['Acme', 'itau'])).toBe('itau')
		expect(blockingCompany('Banco Itaú Unibanco', ['Itaú Unibanco S.A.'])).toBe('Itaú Unibanco S.A.')
		expect(blockingCompany('ACME LTDA', ['Acme'])).toBe('Acme')
	})

	test('pedaço de palavra ou palavras fora de ordem não bloqueiam', () => {
		expect(blockingCompany('Stonehenge Tech', ['Stone'])).toBeNull()
		expect(blockingCompany('Unibanco Itaú', ['Itaú Unibanco'])).toBeNull()
	})

	test('vaga sem empresa nunca é bloqueada', () => {
		expect(blockingCompany(null, ['Acme'])).toBeNull()
		expect(blockingCompany('', ['Acme'])).toBeNull()
	})
})
