import { describe, expect, test } from 'bun:test'

import { buildExtractionMessages, EXTRACTION_OUTPUT_FORMAT } from './extraction-prompt'

describe('prompt', () => {
	test('schema de saída exige todos os campos', () => {
		expect(EXTRACTION_OUTPUT_FORMAT.type).toBe('object')
		expect(EXTRACTION_OUTPUT_FORMAT.required).toEqual(expect.arrayContaining(['postType', 'title', 'company', 'contractTypes']))
		expect(EXTRACTION_OUTPUT_FORMAT.required).not.toContain('aiJobConfidence')
	})

	test('instruções em system e o post por último', () => {
		const messages = buildExtractionMessages({ text: 'Vaga Vue', author: 'Ana' }, null)
		expect(messages[0]?.role).toBe('system')
		expect(messages.at(-1)).toEqual({ role: 'user', content: 'Post author: Ana\nPost:\nVaga Vue' })
	})

	test('não supõe uma área: sem "software development" nem "technologies" para escolher a vaga ou os conhecimentos', () => {
		const system = String(buildExtractionMessages({ text: 'Vaga', author: null }, 'Enfermeiro Assistencial')[0]?.content)

		expect(system).not.toContain('software development')
		expect(system).toContain('skills, tools and qualifications')
		expect(system).toContain('COREN')
	})
})

describe('post com várias vagas', () => {
	const systemFor = (targetRole: string | null) =>
		String(buildExtractionMessages({ text: 'Vagas', author: null }, targetRole)[0]?.content)

	test('com perfil, escolhe a vaga mais próxima do cargo-alvo', () => {
		expect(systemFor('Analista de Marketing Digital')).toContain(
			'extract only ONE: the opening most related to the role "Analista de Marketing Digital" (or the first one if none is).',
		)
	})

	test('sem perfil, escolhe a primeira', () => {
		const system = systemFor(null)

		expect(system).toContain('extract only ONE: the first one.')
		expect(system).not.toContain('{')
	})

	test('o cargo-alvo entra como texto, sem quebrar o prompt', () => {
		const system = systemFor('Dev "Sênior" $& {severalOpenings}')

		expect(system).toContain('the role "Dev \\"Sênior\\" $& {severalOpenings}"')
	})
})
