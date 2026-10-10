import { describe, expect, test } from 'bun:test'

import { looksLikeAppApproval } from './verification'

describe('looksLikeAppApproval', () => {
	test('reconhece o pedido de aprovação pelo app (pt e en)', () => {
		expect(looksLikeAppApproval('Verifique seu app do LinkedIn\nEnviamos uma notificação para o seu celular')).toBe(true)
		expect(looksLikeAppApproval('Abra o aplicativo do LinkedIn para confirmar que é você')).toBe(true)
		expect(looksLikeAppApproval('Check your LinkedIn app to approve this sign in')).toBe(true)
	})

	test('não confunde com outras páginas', () => {
		expect(looksLikeAppApproval('Digite o código de 6 dígitos enviado para o seu e-mail')).toBe(false)
		expect(looksLikeAppApproval('Vamos fazer uma verificação rápida de segurança')).toBe(false)
	})
})
