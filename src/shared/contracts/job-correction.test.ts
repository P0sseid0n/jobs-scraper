import { describe, expect, test } from 'bun:test'

import { JobCorrectionSchema, jobFields } from './job-correction'

/** Os erros por campo, como a API devolve (caminho com pontos → primeira mensagem). */
function errorsOf(body: unknown) {
	const result = JobCorrectionSchema.safeParse(body)
	if (result.success) return null
	return Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.') || '_', issue.message]))
}

describe('JobCorrectionSchema (PATCH /api/jobs/:postId)', () => {
	test('aceita só os campos enviados, limpando espaços e trocando vazio por null', () => {
		expect(JobCorrectionSchema.parse({ company: '  Acme  ', location: '   ', recruiterEmail: '', applyLink: '' })).toEqual({
			company: 'Acme',
			location: null,
			recruiterEmail: null,
			applyLink: null,
		})
	})

	test('tecnologias sem vazias nem repetidas (sem diferenciar maiúsculas); lista vazia vira null', () => {
		expect(JobCorrectionSchema.parse({ necessaryKnowledge: [' Vue.js ', 'vue.js', '', 'TypeScript'] })).toEqual({
			necessaryKnowledge: ['Vue.js', 'TypeScript'],
		})
		expect(JobCorrectionSchema.parse({ necessaryKnowledge: [] })).toEqual({ necessaryKnowledge: null })
	})

	test('regimes na ordem de CONTRACT_TYPES, sem repetição', () => {
		expect(JobCorrectionSchema.parse({ contractTypes: ['pj', 'clt', 'pj'] })).toEqual({ contractTypes: ['clt', 'pj'] })
		expect(JobCorrectionSchema.parse({ contractTypes: [] })).toEqual({ contractTypes: null })
	})

	test('erros por campo', () => {
		expect(
			errorsOf({
				title: '  ',
				workMode: 'home office',
				contractTypes: ['temporario'],
				recruiterEmail: 'rh@',
				applyLink: 'javascript:alert(1)',
			}),
		).toMatchObject({
			title: 'O cargo não pode ficar vazio',
			workMode: expect.any(String),
			'contractTypes.0': expect.any(String),
			recruiterEmail: expect.any(String),
			applyLink: expect.any(String),
		})
	})

	test('o cargo não pode virar null, mas os outros campos podem', () => {
		expect(errorsOf({ title: null })).toHaveProperty('title')
		expect(JobCorrectionSchema.parse({ company: null, workMode: null, contractTypes: null })).toEqual({
			company: null,
			workMode: null,
			contractTypes: null,
		})
	})

	test('"não é vaga" sozinho; junto com campos, ou sem nada, é inválido', () => {
		expect(JobCorrectionSchema.parse({ notAJob: true })).toEqual({ notAJob: true })
		expect(errorsOf({ notAJob: true, company: 'Acme' })).toHaveProperty('notAJob')
		expect(errorsOf({})).toHaveProperty('_')
		expect(errorsOf({ notAJob: false })).toHaveProperty('notAJob')
	})

	test('"outro idioma" sozinho; junto com campos ou com "não é vaga", é inválido', () => {
		expect(JobCorrectionSchema.parse({ wrongLanguage: true })).toEqual({ wrongLanguage: true })
		expect(errorsOf({ wrongLanguage: true, company: 'Acme' })).toHaveProperty('wrongLanguage')
		expect(errorsOf({ wrongLanguage: true, notAJob: true })).toHaveProperty('notAJob')
	})

	test('rejeita campos que não são corrigíveis', () => {
		expect(errorsOf({ extractionChecks: [] })).not.toBeNull()
		expect(errorsOf({ title: 'Dev', rawContent: 'outro texto' })).not.toBeNull()
	})
})

test('jobFields: lista vazia e campo ausente viram null', () => {
	expect(jobFields({ title: 'Dev', necessaryKnowledge: [], contractTypes: ['pj'] })).toEqual({
		title: 'Dev',
		company: null,
		location: null,
		workMode: null,
		contractTypes: ['pj'],
		necessaryKnowledge: null,
		recruiterEmail: null,
		applyLink: null,
	})
})
