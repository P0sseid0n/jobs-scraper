import { describe, expect, test } from 'bun:test'

import { escapeLatex, latexToPlainText } from './latex-syntax'

describe('sintaxe LaTeX', () => {
	test('latexToPlainText e escapeLatex', () => {
		expect(latexToPlainText('\\textbf{IA \\& LLM:} \\href{https://x.dev}{x.dev} \\hfill 2022')).toBe('IA & LLM: x.dev 2022')
		expect(escapeLatex('C# & 50% de_x {y}')).toBe('C\\# \\& 50\\% de\\_x \\{y\\}')
	})
})
