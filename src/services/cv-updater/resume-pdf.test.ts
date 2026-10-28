import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { createLogger } from '@shared/logging'

import { renderOnePagePdf } from './resume-pdf'
import { readResumeTex } from './resume/latex-reader'
import type { ResumeProject, TailoredResume } from './resume/resume.types'

const log = createLogger('test')
const base = readResumeTex(readFileSync(path.join(import.meta.dir, 'assets/cv.example.tex'), 'utf8'))

const project = (name: string): ResumeProject => ({
	name,
	url: `github.com/fulano/${name}`,
	description: 'Projeto.',
	technologies: ['TypeScript'],
})

const tailored: TailoredResume = {
	...base.model,
	summary: 'Apresentação ajustada.',
	projects: ['A', 'B', 'C', 'D'].map(project),
}

/** Compilador falso: cabem `fit` projetos numa página (sem `fit`, o número de páginas é desconhecido). */
const compiler = (fit: number | null) => {
	const compiled: number[] = []
	const compile = async (tex: string) => {
		const projects = tex.match(/Tecnologias:/g)?.length ?? 0
		compiled.push(projects)
		return { pdf: Buffer.from('%PDF'), pages: fit === null ? null : projects <= fit ? 1 : 2 }
	}

	return { compile, compiled }
}

describe('PDF em uma página', () => {
	test('coloca os projetos que couberem além dos 2 primeiros', async () => {
		const { compile, compiled } = compiler(3)
		const { resume } = await renderOnePagePdf(base, tailored, compile, log)

		expect(resume.projects.map(item => item.name)).toEqual(['A', 'B', 'C'])
		expect(resume.summary).toBe('Apresentação ajustada.')
		expect(compiled).toEqual([2, 3, 4])
	})

	test('cabendo todos, para no último candidato', async () => {
		const { compile, compiled } = compiler(10)
		const { resume } = await renderOnePagePdf(base, tailored, compile, log)

		expect(resume.projects).toHaveLength(4)
		expect(compiled).toEqual([2, 3, 4])
	})

	test('se nem 2 projetos couberem, mantém os 2 e volta à apresentação original', async () => {
		const { compile } = compiler(1)
		const { resume } = await renderOnePagePdf(base, tailored, compile, log)

		expect(resume.projects.map(item => item.name)).toEqual(['A', 'B'])
		expect(resume.summary).toBe(base.model.summary)
	})

	test('sem o número de páginas, fica no mínimo', async () => {
		const { compile, compiled } = compiler(null)
		const { resume } = await renderOnePagePdf(base, tailored, compile, log)

		expect(resume.projects).toHaveLength(2)
		expect(compiled).toEqual([2])
	})
})
