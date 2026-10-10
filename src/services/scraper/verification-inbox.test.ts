import { afterEach, describe, expect, test } from 'bun:test'

import { closeVerificationInbox, openVerificationInbox, submitVerificationCode, takeVerificationCode } from './verification-inbox'

describe('verification inbox', () => {
	afterEach(closeVerificationInbox)

	test('ignora códigos quando nenhum login está esperando', () => {
		expect(submitVerificationCode('123456')).toBe(false)

		openVerificationInbox()
		expect(takeVerificationCode()).toBeUndefined()
	})

	test('entrega o último código recebido uma única vez', () => {
		openVerificationInbox()

		expect(submitVerificationCode('111111')).toBe(true)
		submitVerificationCode('222222')

		expect(takeVerificationCode()).toBe('222222')
		expect(takeVerificationCode()).toBeUndefined()
	})

	test('fechar descarta o código pendente', () => {
		openVerificationInbox()
		submitVerificationCode('123456')
		closeVerificationInbox()

		expect(submitVerificationCode('654321')).toBe(false)
		expect(takeVerificationCode()).toBeUndefined()
	})
})
