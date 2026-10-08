import type { Logger } from '@shared/logging'

import { compileLatex, type CompileOptions } from './latex-compiler'
import { writeResumeTex } from './resume/latex-writer'
import type { ParsedResume, TailoredResume } from './resume/resume.types'

/**
 * Gera o PDF do currículo ajustado garantindo uma página. Se transbordar:
 * primeiro tira projetos (até sobrar 1), depois volta para a apresentação original.
 */
export async function renderOnePagePdf(base: ParsedResume, tailored: TailoredResume, compileOptions: CompileOptions, log: Logger) {
	const attempts = simplifications(base, tailored)

	let result = await compileLatex(writeResumeTex(base, attempts[0]!), compileOptions)

	for (const attempt of attempts.slice(1)) {
		if (result.pages === null || result.pages <= 1) break

		log.info({ pages: result.pages, projects: attempt.projects.length }, 'Currículo passou de uma página, simplificando')
		result = await compileLatex(writeResumeTex(base, attempt), compileOptions)
	}

	return result.pdf
}

/** Nome do arquivo: "Curriculo-Empresa-Cargo.pdf", sem acentos nem caracteres especiais. */
export function pdfFileName(job: { title: string | null; company: string | null }) {
	const slug = [job.company, job.title]
		.filter(Boolean)
		.join(' ')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60)

	return `Curriculo${slug ? `-${slug}` : ''}.pdf`
}

/** Versões cada vez mais simples do currículo, na ordem em que são tentadas. */
function simplifications(base: ParsedResume, tailored: TailoredResume) {
	const attempts: TailoredResume[] = [tailored]

	for (let count = tailored.projects.length - 1; count >= 1; count--) {
		attempts.push({ ...tailored, projects: tailored.projects.slice(0, count) })
	}

	attempts.push({ ...attempts.at(-1)!, summary: base.model.summary })

	return attempts
}
