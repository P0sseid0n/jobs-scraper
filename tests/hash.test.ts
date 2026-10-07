import { describe, expect, test } from 'bun:test'
import { hashPost, normalizePostText } from '../src/utils/hash'

describe('hashPost', () => {
	test('gera o mesmo ID para textos que só diferem em espaços e caixa', () => {
		expect(hashPost('Vaga  Front End\n\nVue  ')).toBe(hashPost('vaga front end vue'))
	})

	test('gera IDs diferentes para conteúdos diferentes', () => {
		expect(hashPost('Vaga Vue')).not.toBe(hashPost('Vaga React'))
	})

	test('normaliza espaços e caixa', () => {
		expect(normalizePostText('  Olá\tMUNDO \n')).toBe('olá mundo')
	})
})
