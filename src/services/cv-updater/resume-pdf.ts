import type { Logger } from '@shared/logging'

import type { CompileResult } from './latex-compiler'
import { writeResumeTex } from './resume/latex-writer'
import type { ParsedResume, TailoredResume } from './resume/resume.types'

// Projetos que o currículo sempre tem (se houver tantos); os seguintes entram enquanto couberem em uma página
const MIN_PROJECTS = 2

/**
 * Gera o PDF do currículo em uma página, com o máximo de projetos que couber, na ordem recebida (no mínimo
 * `MIN_PROJECTS`). Se nem o mínimo couber, volta à apresentação original. Devolve também a versão que entrou no PDF
 * (`resume`).
 */
export async function renderOnePagePdf(
	base: ParsedResume,
	tailored: TailoredResume,
	compile: (tex: string) => Promise<CompileResult>,
	log: Logger,
) {
	const withProjects = (count: number): TailoredResume => ({ ...tailored, projects: tailored.projects.slice(0, count) })
	const minimum = Math.min(MIN_PROJECTS, tailored.projects.length)

	let resume = withProjects(minimum)
	let result = await compile(writeResumeTex(base, resume))

	if (result.pages !== null && result.pages > 1) {
		log.info({ pages: result.pages, projects: minimum }, 'Currículo passou de uma página, voltando à apresentação original')
		resume = { ...resume, summary: base.model.summary }
		return { pdf: (await compile(writeResumeTex(base, resume))).pdf, resume }
	}

	// Sem o número de páginas não dá para saber se mais um projeto cabe
	for (let count = minimum + 1; result.pages === 1 && count <= tailored.projects.length; count++) {
		const attempt = withProjects(count)
		const attemptResult = await compile(writeResumeTex(base, attempt))
		if (attemptResult.pages !== 1) break

		resume = attempt
		result = attemptResult
	}

	return { pdf: result.pdf, resume }
}

/** Monta o nome do arquivo ("Curriculo-Empresa-Cargo.pdf"), sem acentos nem caracteres especiais. */
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
