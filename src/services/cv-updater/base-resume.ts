import { findActiveCvBase } from '@shared/database'
import type { Logger } from '@shared/logging'

import { compileLatex, LatexCompileError, type CompileOptions, type CompileResult } from './latex-compiler'
import { readResumeTex } from './resume/latex-reader'
import { SECTION_TITLES } from './resume/latex-syntax'
import type { ParsedResume } from './resume/resume.types'

/** Seções que o currículo base precisa ter para ser ajustado (`\section*{título}`, com os títulos de SECTION_TITLES). */
export const EXPECTED_SECTIONS: readonly (keyof typeof SECTION_TITLES)[] = ['summary', 'skills', 'projects', 'experience']

/** O currículo base interpretado e de onde ele veio: o id da versão ativa no banco, ou `null` para o arquivo. */
export type BaseResume = { resume: ParsedResume; versionId: string | null }

/**
 * Lê e interpreta o currículo base: a versão ativa no banco (trocada pelo site) ou, sem nenhuma, o arquivo `texFile`.
 * É relido a cada pedido: uma versão nova vale sem reiniciar o serviço.
 */
export async function loadBaseResume(texFile: string): Promise<BaseResume> {
	const active = await findActiveCvBase()
	if (active) return { resume: readResumeTex(active.tex), versionId: active.versionId }

	const file = Bun.file(texFile)

	if (!(await file.exists())) {
		throw new Error(
			`Currículo base não encontrado em ${texFile}. Envie um .tex pelo site (Configurações › Currículo base) ou coloque o seu lá (use src/services/cv-updater/assets/cv.example.tex como modelo).`,
		)
	}

	return { resume: readResumeTex(await file.text()), versionId: null }
}

/** Títulos das seções esperadas que o `.tex` não tem. */
export function missingSections(resume: ParsedResume) {
	return EXPECTED_SECTIONS.filter(section => !resume.sections[section]).map(section => SECTION_TITLES[section])
}

export type BaseValidation = { errors: string[]; pdf: Buffer | null; pages: number | null }

/**
 * Valida um `.tex` candidato a currículo base: interpreta, confere as seções esperadas e compila. Compila mesmo com
 * seções faltando, para mostrar todos os problemas de uma vez. Sem `errors`, o `.tex` pode virar o currículo base.
 * @throws Erros que não são do LaTeX (ex.: disco cheio), para a mensagem ser tentada de novo.
 */
export async function validateBaseTex(tex: string, compile: (tex: string) => Promise<CompileResult>): Promise<BaseValidation> {
	const errors = missingSections(readResumeTex(tex)).map(title => `Falta a seção \\section*{${title}}.`)

	try {
		const { pdf, pages } = await compile(tex)
		return { errors, pdf, pages }
	} catch (error) {
		if (!(error instanceof LatexCompileError)) throw error

		return { errors: [...errors, error.message], pdf: null, pages: null }
	}
}

/**
 * Valida o currículo base e o Tectonic na inicialização, para falhar cedo com uma mensagem clara.
 * A primeira compilação baixa os pacotes LaTeX e pode levar alguns minutos.
 */
export async function checkBaseResume(texFile: string, compileOptions: CompileOptions, logger: Logger) {
	const { resume, versionId } = await loadBaseResume(texFile)

	const missing = missingSections(resume)
	if (missing.length > 0) {
		logger.warn({ missing, versionId }, 'Seções não encontradas no .tex; elas não serão ajustadas')
	}

	logger.info({ versionId }, 'Compilando o currículo base para validar o Tectonic e as fontes...')
	const { pages } = await compileLatex(resume.tex, compileOptions)

	logger.info({ pages, versionId }, 'Currículo base compilado')
}
