import { describe, expect, test } from 'bun:test'

import { catalogKeys, mergeCatalog } from './catalog'
import { coverage, localeForLanguage, messagesFor, missingKeys, resolveLocale } from './i18n'
import { BASE_LOCALE, FALLBACK_LOCALE, LOCALE_CODES, LOCALES } from './locales'

describe('catálogos', () => {
	// O `pt-BR` define as chaves; o `en` é para onde caem os textos que faltam nos outros, então também fica completo
	test.each([BASE_LOCALE, FALLBACK_LOCALE])('%s está completo', locale => {
		expect(missingKeys(locale)).toEqual([])
		expect(coverage(locale)).toBe(100)
	})

	test.each(LOCALE_CODES)('%s não tem chaves que o catálogo base não tem', locale => {
		const base = new Set(catalogKeys(LOCALES[BASE_LOCALE].messages))
		expect(catalogKeys(LOCALES[locale].messages).filter(key => !base.has(key))).toEqual([])
	})

	test.each(LOCALE_CODES)('%s tem nome e as mensagens do zod', locale => {
		expect(LOCALES[locale].name.trim()).not.toBe('')
		expect(LOCALES[locale].zod().localeError).toBeFunction()
	})

	test('num catálogo incompleto, o que falta vem do idioma de reserva, e não a chave crua', () => {
		const base = { a: 'A', group: { b: 'B', c: 'C' }, list: ['x', 'y'] }
		const merged = mergeCatalog(base, { group: { b: 'Bê' }, list: ['xis'] })

		expect(merged).toEqual({ a: 'A', group: { b: 'Bê', c: 'C' }, list: ['xis'] })
	})

	test('o idioma base usa o próprio catálogo, sem misturar com o de reserva', () => {
		expect(messagesFor(BASE_LOCALE)).toBe(LOCALES[BASE_LOCALE].messages as never)
	})
})

describe('escolha do idioma', () => {
	test('o primeiro idioma do navegador que o sistema tem, exato ou de outra região', () => {
		expect(resolveLocale(['en-US', 'pt-BR'])).toBe('en')
		expect(resolveLocale(['pt-PT'])).toBe('pt-BR')
		expect(resolveLocale(['fr-FR', 'en'])).toBe('en')
	})

	test('sem nenhum idioma conhecido, o pt-BR', () => {
		expect(resolveLocale(['fr-FR', 'de'])).toBe('pt-BR')
		expect(resolveLocale([])).toBe('pt-BR')
	})

	test('o idioma do sistema para o idioma detectado num post', () => {
		expect(localeForLanguage('en')).toBe('en')
		expect(localeForLanguage('pt')).toBe('pt-BR')
		expect(localeForLanguage('es')).toBeNull()
	})
})
