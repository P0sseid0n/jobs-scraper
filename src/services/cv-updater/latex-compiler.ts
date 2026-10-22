import { existsSync } from 'node:fs'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type CompileOptions = {
	/** Executável do Tectonic. */
	tectonicBin: string

	/** Pasta com as fontes usadas pelo `.tex` (ex.: Nunito-Regular.otf). */
	fontsDir: string
}

export type CompileResult = { pdf: Buffer; pages: number | null }

export class LatexCompileError extends Error {
	override name = 'LatexCompileError'
}

/**
 * Pasta das fontes ao lado do `.tex` compilado. O caminho no `.tex` precisa ser relativo:
 * caminhos absolutos com letra de unidade (C:/...) quebram a busca de fontes do fontspec no Windows.
 */
const FONTS_SUBDIR = 'fonts'

/**
 * Compila o `.tex` com o Tectonic numa pasta temporária e devolve o PDF e o número de páginas.
 * @throws {LatexCompileError} Se o Tectonic não for encontrado ou a compilação falhar.
 */
export async function compileLatex(tex: string, options: CompileOptions): Promise<CompileResult> {
	const dir = await mkdtemp(path.join(tmpdir(), 'cv-'))

	try {
		await Bun.write(path.join(dir, 'cv.tex'), withProjectFonts(tex, options.fontsDir))

		if (existsSync(options.fontsDir)) {
			await cp(options.fontsDir, path.join(dir, FONTS_SUBDIR), { recursive: true })
		}

		await runTectonic(options.tectonicBin, dir)

		const log = await Bun.file(path.join(dir, 'cv.log'))
			.text()
			.catch(() => '')
		const pdf = Buffer.from(await Bun.file(path.join(dir, 'cv.pdf')).arrayBuffer())

		return { pdf, pages: pagesFromLog(log) }
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
}

/**
 * Faz o `\setmainfont{Família}` usar os arquivos de `fontsDir` (`Família-Regular.otf`...), para o PDF sair
 * igual ao do Overleaf sem as fontes instaladas. O negrito usa ExtraBold quando existir.
 */
export function withProjectFonts(tex: string, fontsDir: string) {
	return tex.replace(/\\setmainfont\{([^}]+)\}(?!\s*\[)/, (original, family: string) => {
		const file = (style: string) => path.join(fontsDir, `${family}-${style}.otf`)
		if (!existsSync(file('Regular'))) return original

		const bold = existsSync(file('ExtraBold')) ? 'ExtraBold' : 'Bold'
		const options = [
			`Path=./${FONTS_SUBDIR}/`,
			'Extension=.otf',
			'UprightFont=*-Regular',
			'ItalicFont=*-Italic',
			`BoldFont=*-${bold}`,
			`BoldItalicFont=*-${bold}Italic`,
		]

		return `\\setmainfont{${family}}[${options.join(', ')}]`
	})
}

/** Extrai o número de páginas do log do TeX ("Output written on cv.xdv (1 page, ...)"), ou `null`. */
export function pagesFromLog(log: string) {
	const match = log.match(/Output written on .*?\((\d+) pages?/)

	return match ? Number(match[1]) : null
}

async function runTectonic(tectonicBin: string, dir: string) {
	let process: ReturnType<typeof Bun.spawn>

	try {
		process = Bun.spawn([tectonicBin, '-X', 'compile', '--keep-logs', 'cv.tex'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' })
	} catch (error) {
		throw new LatexCompileError(`Tectonic não encontrado em "${tectonicBin}" (configure TECTONIC_BIN)`, { cause: error })
	}

	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		new Response(process.stdout as ReadableStream).text(),
		new Response(process.stderr as ReadableStream).text(),
	])

	if (exitCode === 0) return

	const errors = latexErrors(`${stdout}\n${stderr}`)

	throw new LatexCompileError(`Falha ao compilar o currículo: ${errors.join(' | ') || `tectonic saiu com código ${exitCode}`}`)
}

/**
 * Os erros do LaTeX na saída do Tectonic, com a linha do `.tex` quando o TeX a informa
 * (ex.: "Undefined control sequence. (linha 94: \naoexiste)"). As linhas que começam com "!" descrevem o erro, a
 * "l.94 ..." seguinte diz onde e as "*** ..." explicam a parada. Sem nenhuma, ficam as linhas "error:" do Tectonic.
 */
export function latexErrors(output: string) {
	const lines = output.split(/\r?\n/)
	const errors: string[] = []

	lines.forEach((line, index) => {
		if (!line.startsWith('! ')) return

		let message = line.slice(2).trim()
		for (const next of lines.slice(index + 1, index + 8)) {
			if (next.startsWith('! ')) break

			const where = next.match(/^l\.(\d+)\s*(.*)$/)
			if (where) {
				message += where[2] ? ` (linha ${where[1]}: ${where[2].trim()})` : ` (linha ${where[1]})`
				break
			}
			if (next.startsWith('*** ')) message += ` ${next.slice(4).trim()}`
		}

		if (!errors.includes(message)) errors.push(message)
	})

	if (errors.length > 0) return errors.slice(0, 5)

	return lines.filter(line => line.startsWith('error:')).slice(0, 5)
}
