import { describe, expect, test } from 'bun:test'

import {
	buildExtractionMessages,
	EXTRACTION_OUTPUT_FORMAT,
	EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES,
	EXTRACTION_PROMPT_VERSION,
	EXTRACTION_PROMPT_VERSION_WITH_IMAGES,
	extractionOutputFormat,
	extractionPromptVersion,
} from './extraction-prompt'

describe('prompt', () => {
	test('schema de saída exige todos os campos', () => {
		expect(EXTRACTION_OUTPUT_FORMAT.type).toBe('object')
		expect(EXTRACTION_OUTPUT_FORMAT.required).toEqual(expect.arrayContaining(['postType', 'title', 'company', 'contractTypes']))
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
			'extract only ONE: the opening closest to the role "Analista de Marketing Digital", even if it is not the first one listed',
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

describe('post com imagens', () => {
	const images = [{ data: 'aW1hZ2Vt' }, { data: 'b3V0cmE=' }]

	test('sem imagens, as mensagens e o formato são os de antes delas', () => {
		const messages = buildExtractionMessages({ text: 'Vaga Vue', author: 'Ana', images: [] }, null)

		expect(messages).toEqual(buildExtractionMessages({ text: 'Vaga Vue', author: 'Ana' }, null))
		expect(String(messages[0]?.content)).not.toContain('imageText')
		expect(messages.at(-1)).not.toHaveProperty('images')
		expect(extractionOutputFormat({ images: [] })).toBe(EXTRACTION_OUTPUT_FORMAT)
		expect(extractionPromptVersion({ images: [] })).toBe(EXTRACTION_PROMPT_VERSION)
	})

	test('as imagens vão na mensagem do post, com as instruções de transcrever e usar o texto delas', () => {
		const messages = buildExtractionMessages({ text: 'Detalhes na imagem', author: 'Ana', images }, null)
		const system = String(messages[0]?.content)

		expect(system).toContain('transcribe all the text written in the images')
		expect(system).toContain('never mix fields from different openings')
		expect(messages.at(-1)).toEqual({
			role: 'user',
			content: 'Post author: Ana\nPost:\nDetalhes na imagem\n\nImages attached: 2',
			images: ['aW1hZ2Vt', 'b3V0cmE='],
		})
	})

	test('o modelo transcreve as imagens antes de classificar o post', () => {
		const format = extractionOutputFormat({ images })

		expect(format).toBe(EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES)
		expect(Object.keys(format.properties ?? {})[0]).toBe('imageText')
		expect(format.required).toEqual(expect.arrayContaining(['imageText', 'postType', 'title']))
	})

	test('o prompt com imagens tem versão própria', () => {
		expect(extractionPromptVersion({ images })).toBe(EXTRACTION_PROMPT_VERSION_WITH_IMAGES)
		expect(EXTRACTION_PROMPT_VERSION_WITH_IMAGES).not.toBe(EXTRACTION_PROMPT_VERSION)
	})
})
