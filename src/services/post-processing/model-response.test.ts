import { describe, expect, test } from 'bun:test'

import { keepLinkIfInPost, keepSkillsInPost, locationWithoutWorkMode, parseModelResponse, rejectionReason } from './model-response'

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

describe('keepLinkIfInPost', () => {
	const text = 'Candidate-se em https://empresa.com/vagas/123 até sexta'

	test('mantém o link que está no texto', () => {
		expect(keepLinkIfInPost('https://empresa.com/vagas/123', text)).toBe('https://empresa.com/vagas/123')
	})

	test('descarta link inventado ou que não é URL', () => {
		expect(keepLinkIfInPost('https://empresa.com/careers', text)).toBeNull()
		expect(keepLinkIfInPost('empresa.com', text)).toBeNull()
		expect(keepLinkIfInPost(null, text)).toBeNull()
	})
})

describe('keepSkillsInPost', () => {
	const text = 'Vaga Full-Stack: 𝐂# / Python / Vue.js 3, NestJS e Node. Experiência com APIs REST e Microsoft Azure.'

	test('mantém os conhecimentos escritos no post, mesmo com outra grafia', () => {
		const skills = ['C#', 'Python', 'Vue.js', 'NestJS', 'Node.js', 'REST API', 'Azure']

		expect(keepSkillsInPost(skills, text)).toEqual(skills)
	})

	test('remove os que não estão no post', () => {
		expect(keepSkillsInPost(['Vue.js', 'React', 'SQL', 'Full Stack Development'], text)).toEqual(['Vue.js'])
	})

	test('não confunde letra solta com parte de palavra', () => {
		expect(keepSkillsInPost(['C', 'R'], 'Vaga para dev com experiência em React')).toBeNull()
	})

	test('null quando nada sobra ou não havia conhecimentos', () => {
		expect(keepSkillsInPost(['Java'], text)).toBeNull()
		expect(keepSkillsInPost(null, text)).toBeNull()
	})
})

describe('locationWithoutWorkMode', () => {
	test('descarta o local quando ele é só a modalidade', () => {
		for (const location of ['remoto', 'Remoto', '100% Remoto', 'Home Office', 'Híbrido', 'remote']) {
			expect(locationWithoutWorkMode(location)).toBeNull()
		}
	})

	test('mantém locais de verdade, mesmo com a modalidade junto', () => {
		expect(locationWithoutWorkMode('São Paulo, SP')).toBe('São Paulo, SP')
		expect(locationWithoutWorkMode('Remoto (Brasil)')).toBe('Remoto (Brasil)')
		expect(locationWithoutWorkMode(null)).toBeNull()
	})
})
