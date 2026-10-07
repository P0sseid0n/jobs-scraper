import { describe, expect, test } from 'bun:test'
import { parseModelResponse } from '../src/services/post-processing/parse'

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
