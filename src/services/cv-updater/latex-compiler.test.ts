import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { pagesFromLog, withProjectFonts } from './latex-compiler'

describe('compilador LaTeX', () => {
	test('aponta a fonte para os arquivos do projeto só se existirem', () => {
		const fontsDir = path.join(import.meta.dir, './assets/fonts')
		expect(withProjectFonts('\\setmainfont{Nunito}', fontsDir)).toContain('BoldFont=*-ExtraBold')
		expect(withProjectFonts('\\setmainfont{Inexistente}', fontsDir)).toBe('\\setmainfont{Inexistente}')
	})

	test('lê o número de páginas do log do TeX', () => {
		expect(pagesFromLog('Output written on cv.xdv (1 page, 12345 bytes).')).toBe(1)
		expect(pagesFromLog('Output written on cv.xdv (2 pages, 23456 bytes).')).toBe(2)
		expect(pagesFromLog('sem saída')).toBeNull()
	})
})
