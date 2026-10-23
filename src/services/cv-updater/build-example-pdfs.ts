/**
 * Gera os PDFs dos modelos de currículo (`assets/*.example.tex` → `assets/*.example.pdf`), mostrados pelo site em
 * "Currículo base › modelos". Rode `bun cv:examples` sempre que mudar um dos `.tex` de exemplo.
 */
import path from 'node:path'
import { z } from 'zod'

import { cvUpdaterEnv } from './config'
import { compileLatex } from './latex-compiler'

const EXAMPLES = ['cv.example.tex', 'cv.neutral.example.tex']

const config = z.object({ TECTONIC_BIN: cvUpdaterEnv.TECTONIC_BIN, CV_FONTS_DIR: cvUpdaterEnv.CV_FONTS_DIR }).parse(process.env)
const assets = path.join(import.meta.dir, 'assets')

for (const name of EXAMPLES) {
	const tex = await Bun.file(path.join(assets, name)).text()
	const { pdf, pages } = await compileLatex(tex, { tectonicBin: config.TECTONIC_BIN, fontsDir: config.CV_FONTS_DIR })

	const output = path.join(assets, name.replace(/\.tex$/, '.pdf'))
	await Bun.write(output, pdf)
	console.log(`${path.relative(process.cwd(), output)}: ${pages ?? '?'} página(s), ${Math.round(pdf.length / 1024)} KB`)
}
