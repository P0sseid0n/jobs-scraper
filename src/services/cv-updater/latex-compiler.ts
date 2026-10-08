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

/** Compila o `.tex` com o Tectonic (XeTeX) numa pasta temporária e devolve o PDF e o número de páginas. */
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
 * Se o `.tex` usa `\setmainfont{Família}` e `fontsDir` tem `Família-Regular.otf`, aponta o fontspec para esses
 * arquivos (copiados para `./fonts/` na compilação). Assim o PDF sai com as mesmas fontes do Overleaf mesmo sem
 * elas instaladas no sistema. Negrito usa ExtraBold quando existir, como o Overleaf faz com a Nunito.
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

/** Número de páginas a partir do log do TeX ("Output written on cv.xdv (1 page, ...)"). */
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

	// Linhas do LaTeX que começam com "!" descrevem o erro (ex.: "! Undefined control sequence.")
	const errors = `${stdout}\n${stderr}`
		.split('\n')
		.filter(line => line.startsWith('!') || line.startsWith('error:'))
		.slice(0, 5)

	throw new LatexCompileError(`Falha ao compilar o currículo: ${errors.join(' | ') || `tectonic saiu com código ${exitCode}`}`)
}
