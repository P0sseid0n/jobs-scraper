import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { loadBaseResume, MissingBaseResumeError, missingSections, validateBaseTex } from './base-resume'
import { LatexCompileError, type CompileResult } from './latex-compiler'
import { readResumeTex } from './resume/latex-reader'

const example = await Bun.file(path.join(import.meta.dir, './assets/cv.example.tex')).text()
const neutral = await Bun.file(path.join(import.meta.dir, './assets/cv.neutral.example.tex')).text()

/** Sem o Tectonic: devolve um PDF falso, ou falha como ele falharia. */
const compiles = async (): Promise<CompileResult> => ({ pdf: Buffer.from('%PDF-1.7'), pages: 1 })
const failsToCompile = async (): Promise<CompileResult> => {
	throw new LatexCompileError('Falha ao compilar o currículo: ! Undefined control sequence.')
}

describe('validateBaseTex', () => {
	test('o cv.example.tex passa', async () => {
		expect(missingSections(readResumeTex(example))).toEqual([])

		const result = await validateBaseTex(example, compiles)
		expect(result.errors).toEqual([])
		expect(result.pages).toBe(1)
		expect(result.pdf).not.toBeNull()
	})

	test('um currículo de outra área, com formação e sem projetos, passa', async () => {
		const result = await validateBaseTex(neutral, compiles)
		expect(result.errors).toEqual([])
	})

	test('basta experiência ou formação; apresentação, habilidades e projetos são opcionais', async () => {
		const onlyEducation = example
			.replace('\\section*{Apresentação}', '\\section*{Outra}')
			.replace('\\section*{Habilidades Técnicas}', '\\section*{Outra}')
			.replace('\\section*{Projetos}', '\\section*{Outra}')
			.replace('\\section*{Experiência Profissional}', '\\section*{Outra}')

		expect((await validateBaseTex(onlyEducation, compiles)).errors).toEqual([])
	})

	test('sem experiência nem formação, explica o que falta', async () => {
		const tex = example
			.replace('\\section*{Experiência Profissional}', '\\section*{Outra}')
			.replace('\\section*{Formação Acadêmica}', '')

		const result = await validateBaseTex(tex, compiles)
		expect(result.errors).toEqual([
			'Falta uma seção de experiência ou de formação, como \\section*{Experiência Profissional} ou \\section*{Formação}.',
		])
		// Compila mesmo assim: a prévia ajuda a achar o problema
		expect(result.pdf).not.toBeNull()
	})

	test('um .tex que não compila é recusado com o erro do LaTeX e sem prévia', async () => {
		const result = await validateBaseTex(example.replace('\\end{document}', '\\comandoinexistente\n\\end{document}'), failsToCompile)

		expect(result.errors).toEqual(['Falha ao compilar o currículo: ! Undefined control sequence.'])
		expect(result.pdf).toBeNull()
	})

	test('texto que não é LaTeX acumula as seções que faltam e o erro de compilação', async () => {
		const result = await validateBaseTex('não é um currículo', failsToCompile)

		expect(result.errors).toHaveLength(2)
		expect(result.errors.at(-1)).toContain('Falha ao compilar')
	})

	test('erros fora do LaTeX sobem, para a mensagem ser tentada de novo', async () => {
		const diskFull = async (): Promise<CompileResult> => {
			throw new Error('ENOSPC')
		}

		expect(validateBaseTex(example, diskFull)).rejects.toThrow('ENOSPC')
	})
})

describe('loadBaseResume', () => {
	const noActiveVersion = async () => null

	test('sem versão no banco nem arquivo, avisa que o currículo não está configurado', async () => {
		const missing = path.join(import.meta.dir, 'não-existe.tex')

		await expect(loadBaseResume(missing, noActiveVersion)).rejects.toBeInstanceOf(MissingBaseResumeError)
		await expect(loadBaseResume(missing, noActiveVersion)).rejects.toThrow('Currículo não configurado')
	})

	test('sem versão no banco, usa o arquivo', async () => {
		const base = await loadBaseResume(path.join(import.meta.dir, './assets/cv.example.tex'), noActiveVersion)

		expect(base.versionId).toBeNull()
	})
})
