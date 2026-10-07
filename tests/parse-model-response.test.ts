import { describe, expect, test } from 'bun:test'
import { linkFromText, parseModelResponse, rejectionReason } from '../src/services/post-processing/parse'
import { buildMessages, MODEL_OUTPUT_FORMAT } from '../src/services/post-processing/prompt'

describe('parseModelResponse', () => {
	test('retorna null quando o modelo responde "null"', () => {
		expect(parseModelResponse(' null ')).toBeNull()
	})

	test('normaliza campos com tipo errado ou ausentes', () => {
		const job = parseModelResponse(
			'{"title": "Dev Front End", "company": "", "necessary_knowledge": "Vue, TypeScript", "workMode": "Híbrido", "aiJobConfidence": "85"}',
		)

		expect(job).toEqual({
			title: 'Dev Front End',
			company: null,
			location: null,
			link: null,
			necessary_knowledge: ['Vue', 'TypeScript'],
			recruiter_email: null,
			workMode: 'hibrido',
			postType: null,
			isJob: false,
			aiJobConfidence: 85,
		})
	})

	test('trata "null" e similares em texto como ausentes', () => {
		const job = parseModelResponse(
			'{"title": "null", "company": "N/A", "location": "None", "necessary_knowledge": ["null"], "workMode": "null", "aiJobConfidence": 20}',
		)

		expect(job).toMatchObject({ title: null, company: null, location: null, necessary_knowledge: null, workMode: null })
	})

	test('repara JSON levemente quebrado', () => {
		expect(parseModelResponse("{title: 'Vaga', aiJobConfidence: 90,}")?.title).toBe('Vaga')
	})

	test('lança erro quando a resposta não é um objeto', () => {
		expect(() => parseModelResponse('[1, 2]')).toThrow()
	})
})

describe('rejectionReason', () => {
	const job = parseModelResponse('{"title": "Dev Vue", "isJob": true, "aiJobConfidence": 80}')

	test('aceita vaga com confiança suficiente', () => {
		expect(rejectionReason(job, 60)).toBeNull()
	})

	test('rejeita quando não é vaga, confiança baixa ou resposta null', () => {
		expect(rejectionReason(parseModelResponse('{"isJob": false, "aiJobConfidence": 90}'), 60)).toContain('não é vaga')
		expect(rejectionReason(job, 90)).toContain('abaixo do mínimo')
		expect(rejectionReason(null, 60)).not.toBeNull()
	})

	test('postType decide se é vaga (formato atual)', () => {
		expect(parseModelResponse('{"postType": "job_opening", "aiJobConfidence": 90}')?.isJob).toBe(true)
		expect(parseModelResponse('{"postType": "job_seeker", "isJob": true, "aiJobConfidence": 90}')?.isJob).toBe(false)
		expect(rejectionReason(parseModelResponse('{"postType": "tips_or_list", "aiJobConfidence": 10}'), 60)).toContain('tips_or_list')
	})

	test('aceita isJob como texto', () => {
		expect(parseModelResponse('{"isJob": "true", "aiJobConfidence": 70}')?.isJob).toBe(true)
	})
})

describe('linkFromText', () => {
	const text = 'Candidate-se em https://empresa.com/vagas/123 até sexta'

	test('mantém o link que está no texto', () => {
		expect(linkFromText('https://empresa.com/vagas/123', text)).toBe('https://empresa.com/vagas/123')
	})

	test('descarta link inventado ou que não é URL', () => {
		expect(linkFromText('https://empresa.com/careers', text)).toBeNull()
		expect(linkFromText('empresa.com', text)).toBeNull()
		expect(linkFromText(null, text)).toBeNull()
	})
})

describe('prompt', () => {
	test('schema de saída exige todos os campos', () => {
		expect(MODEL_OUTPUT_FORMAT.type).toBe('object')
		expect(MODEL_OUTPUT_FORMAT.required).toEqual(expect.arrayContaining(['postType', 'aiJobConfidence', 'title', 'company']))
	})

	test('instruções em system e o post por último', () => {
		const messages = buildMessages({ text: 'Vaga Vue', author: 'Ana' })
		expect(messages[0]?.role).toBe('system')
		expect(messages.at(-1)).toEqual({ role: 'user', content: 'Post author: Ana\nPost:\nVaga Vue' })
	})
})
