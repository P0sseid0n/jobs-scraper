import { findActiveCvBase } from '@shared/database'
import type { Logger } from '@shared/logging'

import { compileLatex, LatexCompileError, type CompileOptions, type CompileResult } from './latex-compiler'
import { readResumeTex } from './resume/latex-reader'
import { SECTION_TITLES, type SectionKey } from './resume/latex-syntax'
import type { ParsedResume } from './resume/resume.types'

/**
 * O currículo base precisa ter pelo menos uma destas seções (`\section*{título}`, com um dos títulos aceitos em
 * latex-syntax.ts). As outras (apresentação, habilidades, projetos) são opcionais: as ausentes não são ajustadas.
 */
export const EXPECTED_SECTIONS: readonly SectionKey[] = ['experience', 'education']

/** O currículo base interpretado e de onde ele veio: o id da versão ativa no banco, ou `null` para o arquivo. */
export type BaseResume = { resume: ParsedResume; versionId: string | null }

/** Nenhum currículo base: nem versão ativa no banco, nem o arquivo. A mensagem vai para quem pediu o currículo. */
export class MissingBaseResumeError extends Error {
	constructor() {
		super('Currículo não configurado: envie o seu .tex pelo site, em Meus currículos › Currículo base.')
	}
}

/**
 * Lê e interpreta o currículo base: a versão ativa no banco (trocada pelo site) ou, sem nenhuma, o arquivo `texFile`.
 * É relido a cada pedido: uma versão nova vale sem reiniciar o serviço.
 * @throws {MissingBaseResumeError} Se não houver nenhum dos dois.
 */
export async function loadBaseResume(
	texFile: string,
	findActive: () => Promise<{ tex: string; versionId: string } | null> = findActiveCvBase,
): Promise<BaseResume> {
	const active = await findActive()
	if (active) return { resume: readResumeTex(active.tex), versionId: active.versionId }

	const file = Bun.file(texFile)
	if (!(await file.exists())) throw new MissingBaseResumeError()

	return { resume: readResumeTex(await file.text()), versionId: null }
}

/** O que falta no `.tex` para ser um currículo base: vazio se ele tem pelo menos uma das EXPECTED_SECTIONS. */
export function missingSections(resume: ParsedResume) {
	if (EXPECTED_SECTIONS.some(section => resume.sections[section])) return []

	const titles = EXPECTED_SECTIONS.map(section => `\\section*{${SECTION_TITLES[section]}}`)
	return [`Falta uma seção de experiência ou de formação, como ${titles.join(' ou ')}.`]
}

export type BaseValidation = { errors: string[]; pdf: Buffer | null; pages: number | null }

/**
 * Valida um `.tex` candidato a currículo base: interpreta, confere as seções esperadas e compila. Compila mesmo com
 * seções faltando, para mostrar todos os problemas de uma vez. Sem `errors`, o `.tex` pode virar o currículo base.
 * @throws Erros que não são do LaTeX (ex.: disco cheio), para a mensagem ser tentada de novo.
 */
export async function validateBaseTex(tex: string, compile: (tex: string) => Promise<CompileResult>): Promise<BaseValidation> {
	const errors = missingSections(readResumeTex(tex))

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
 * A primeira compilação baixa os pacotes LaTeX e pode levar alguns minutos. Sem currículo base, só avisa: o serviço
 * sobe e responde aos pedidos com o erro até a pessoa enviar o dela pelo site.
 */
export async function checkBaseResume(texFile: string, compileOptions: CompileOptions, logger: Logger) {
	const base = await loadBaseResume(texFile).catch(error => {
		if (error instanceof MissingBaseResumeError) return null
		throw error
	})

	if (!base) {
		logger.warn(
			{ texFile },
			'Sem currículo base: os pedidos de currículo recebem o erro até você enviar o seu .tex pelo site (Meus currículos › Currículo base) ou colocá-lo no caminho do CV_TEX_FILE',
		)
		return
	}

	const { resume, versionId } = base

	const missing = missingSections(resume)
	if (missing.length > 0) {
		logger.warn({ missing, versionId }, 'O currículo base não tem experiência nem formação; o ajuste quase não muda nada')
	}

	logger.info({ versionId }, 'Compilando o currículo base para validar o Tectonic e as fontes...')
	const { pages } = await compileLatex(resume.tex, compileOptions)

	logger.info({ pages, versionId }, 'Currículo base compilado')
}
