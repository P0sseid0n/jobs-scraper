import { describe, expect, test } from 'bun:test'

import { GMAIL_PRESET, initialSmtpProvider, smtpPresetOf } from './smtp-presets'

describe('smtpPresetOf', () => {
	test('reconhece o Gmail pelo domínio do usuário', () => {
		expect(smtpPresetOf('ana@gmail.com')).toBe(GMAIL_PRESET)
		expect(smtpPresetOf('Ana@GoogleMail.com')).toBe(GMAIL_PRESET)
	})

	test('outros domínios (mesmo os deduzidos, como o Yahoo) não são um provedor recomendado', () => {
		expect(smtpPresetOf('ana@yahoo.com')).toBeNull()
		expect(smtpPresetOf('ana@outlook.com')).toBeNull()
		expect(smtpPresetOf('')).toBeNull()
	})
})

describe('initialSmtpProvider', () => {
	test('sem conta, começa no Gmail, o recomendado', () => {
		expect(initialSmtpProvider({ user: null, host: null })).toBe('gmail')
	})

	test('a conta salva do Gmail abre no Gmail, com ou sem o servidor preenchido', () => {
		expect(initialSmtpProvider({ user: 'ana@gmail.com', host: null })).toBe('gmail')
		expect(initialSmtpProvider({ user: 'ana@gmail.com', host: 'smtp.gmail.com' })).toBe('gmail')
	})

	test('a conta de outro lugar (ou um Gmail com servidor próprio) abre em "outro provedor"', () => {
		expect(initialSmtpProvider({ user: 'ana@empresa.com.br', host: 'smtp.empresa.com.br' })).toBe('other')
		expect(initialSmtpProvider({ user: 'ana@gmail.com', host: 'smtp.relay.com' })).toBe('other')
		expect(initialSmtpProvider({ user: '', host: 'smtp.empresa.com.br' })).toBe('other')
	})
})
