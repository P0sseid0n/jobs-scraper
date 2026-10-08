import type { Logger } from '@shared/logging'

import { compileLatex, type CompileOptions } from './latex-compiler'
import { readResumeTex } from './resume/latex-reader'
import type { ParsedResume } from './resume/resume.types'

const EXPECTED_SECTIONS = ['summary', 'skills', 'projects', 'experience'] as const

/** Lê e interpreta o currículo base. É relido a cada pedido: dá para editar o `.tex` sem reiniciar. */
export async function loadBaseResume(texFile: string): Promise<ParsedResume> {
	const file = Bun.file(texFile)

	if (!(await file.exists())) {
		throw new Error(
			`Currículo base não encontrado em ${texFile}. Coloque seu .tex lá (use src/services/cv-updater/assets/cv.example.tex como modelo).`,
		)
	}

	return readResumeTex(await file.text())
}

/**
 * Valida o currículo base e o Tectonic na inicialização, para falhar cedo com uma mensagem clara.
 * A primeira compilação baixa os pacotes LaTeX e pode levar alguns minutos.
 */
export async function checkBaseResume(texFile: string, compileOptions: CompileOptions, logger: Logger) {
	const resume = await loadBaseResume(texFile)

	const missing = EXPECTED_SECTIONS.filter(section => !resume.sections[section])
	if (missing.length > 0) {
		logger.warn({ missing }, 'Seções não encontradas no .tex; elas não serão ajustadas')
	}

	logger.info('Compilando o currículo base para validar o Tectonic e as fontes...')
	const { pages } = await compileLatex(resume.tex, compileOptions)

	logger.info({ pages }, 'Currículo base compilado')
}
