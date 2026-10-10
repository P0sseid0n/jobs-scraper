import { describe, expect, test } from 'bun:test'

import { canOpenWindow } from './display'

describe('canOpenWindow', () => {
	test('Windows e macOS sempre têm tela', () => {
		expect(canOpenWindow('win32', {})).toBe(true)
		expect(canOpenWindow('darwin', {})).toBe(true)
	})

	test('Linux precisa de um servidor gráfico', () => {
		expect(canOpenWindow('linux', {})).toBe(false)
		expect(canOpenWindow('linux', { DISPLAY: ':0' })).toBe(true)
		expect(canOpenWindow('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(true)
	})
})
