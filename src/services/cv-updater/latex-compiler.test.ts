import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { latexErrors, pagesFromLog, withProjectFonts } from './latex-compiler'

/** Saída real do Tectonic (stdout + stderr) para um `.tex` quebrado. */
const tectonicOutput = (...texLines: string[]) =>
	[
		'(fontspec-xetex.sty (fontenc.sty) (fontspec.cfg)))',
		'error: something bad happened inside XeTeX; its output follows:',
		...texLines,
		'No pages of output.',
		'error: the XeTeX engine had an unrecoverable error',
	].join('\n')

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

	test('tira da saída do Tectonic só os erros do LaTeX, com a linha do .tex', () => {
		const undefinedCommand = tectonicOutput(
			'error: cv.tex:94: Undefined control sequence',
			'! Undefined control sequence.',
			'l.94 \\naoexiste',
		)
		expect(latexErrors(undefinedCommand)).toEqual(['Undefined control sequence. (linha 94: \\naoexiste)'])

		const noEnd = tectonicOutput('error: !Emergency stop', '! Emergency stop', '*** (job aborted, no legal \\end found)')
		expect(latexErrors(noEnd)).toEqual(['Emergency stop (job aborted, no legal \\end found)'])

		const unclosedBrace = tectonicOutput(
			'! File ended while scanning use of \\textbf .',
			'! File ended while scanning use of \\textbf .',
		)
		expect(latexErrors(unclosedBrace)).toEqual(['File ended while scanning use of \\textbf .'])
	})

	test('sem erro do TeX (ex.: o Tectonic não baixou um pacote), ficam as linhas de erro dele', () => {
		expect(latexErrors('note: baixando\nerror: failed to download "geometry.sty"')).toEqual([
			'error: failed to download "geometry.sty"',
		])
	})
})
