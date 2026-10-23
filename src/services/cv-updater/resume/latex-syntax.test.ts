import { describe, expect, test } from 'bun:test'

import { escapeLatex, latexToPlainText } from './latex-syntax'

describe('sintaxe LaTeX', () => {
	test('latexToPlainText e escapeLatex', () => {
		expect(latexToPlainText('\\textbf{IA \\& LLM:} \\href{https://x.dev}{x.dev} \\hfill 2022')).toBe('IA & LLM: x.dev 2022')
		expect(escapeLatex('C# & 50% de_x {y}')).toBe('C\\# \\& 50\\% de\\_x \\{y\\}')
	})

	test('a barra invertida escapada não tem as chaves escapadas de novo, e o texto volta igual', () => {
		const text = 'a\\b ~ ^ "c"'
		const escaped = escapeLatex(text)

		expect(escaped).toBe('a\\textbackslash{}b \\textasciitilde{} \\textasciicircum{} \\textquotedbl{}c\\textquotedbl{}')
		expect(latexToPlainText(`\\textit{${escaped}}`)).toBe(text)
	})
})
