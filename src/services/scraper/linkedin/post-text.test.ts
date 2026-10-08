import { describe, expect, test } from 'bun:test'

import { cleanPostText } from './post-text'

describe('cleanPostText', () => {
	test('mantém quebras de linha e não cola palavras', () => {
		expect(cleanPostText('  Requisitos:\n  Vue \t e  React\n\n\n\nRemoto ')).toBe('Requisitos:\nVue e React\n\nRemoto')
	})
})
