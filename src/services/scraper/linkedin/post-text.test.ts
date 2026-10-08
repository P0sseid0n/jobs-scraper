import { describe, expect, test } from 'bun:test'

import { cleanPostText } from './post-text'

describe('cleanPostText', () => {
	test('mantém quebras de linha e não cola palavras', () => {
		expect(cleanPostText('  Requisitos:\n  Vue \t e  React\n\n\n\nRemoto ')).toBe('Requisitos:\nVue e React\n\nRemoto')
	})

	test('remove o "… mais" do botão de expandir', () => {
		expect(cleanPostText('Vaga Vue.js remoto\n#vagas\n… mais')).toBe('Vaga Vue.js remoto\n#vagas')
		expect(cleanPostText('Hiring Vue developer …see more')).toBe('Hiring Vue developer')
		expect(cleanPostText('Conheça mais sobre a vaga')).toBe('Conheça mais sobre a vaga')
	})
})
