import { describe, expect, test } from 'bun:test'

import { jobFields } from '@shared/contracts'

import {
	caseToRawPost,
	formatReport,
	groupByArea,
	latestPerPost,
	runFromModel,
	sameFieldValue,
	scoreCases,
	type ExtractionCase,
} from './extraction-eval'
import { AiJobOutputSchema } from './extraction-output'

const text = 'Vaga Front-end na Acme, híbrido em São Paulo. Vue.js e TypeScript. CLT. Envie para rh@acme.com'

const fields = jobFields({
	title: 'Front-end',
	company: 'Recrutadora X',
	location: 'São Paulo',
	workMode: 'remoto',
	contractTypes: ['clt'],
	necessaryKnowledge: ['Vue.js'],
	recruiterEmail: 'rh@acme.com',
})

const item: ExtractionCase = {
	postId: 'urn:li:activity:1',
	anonymized: false,
	area: 'dev',
	kind: 'fields',
	post: { text, author: 'Ana Souza', url: null, postedAt: null, sourcePostId: null },
	aiOutput: fields,
	expected: { ...fields, company: 'Acme', workMode: 'hibrido', necessaryKnowledge: ['Vue.js', 'TypeScript'] },
	correctedFields: ['company', 'workMode', 'necessaryKnowledge'],
	model: 'gemma3:4b',
	promptVersion: 'abc',
}

const modelAnswer = (answer: Record<string, unknown>) =>
	AiJobOutputSchema.parse({
		postType: 'job_opening',
		title: 'Front-end',
		company: 'Acme',
		location: 'São Paulo',
		workMode: 'hibrido',
		contractTypes: ['clt'],
		necessary_knowledge: ['TypeScript', 'vue.js'],
		recruiter_email: 'rh@acme.com',
		link: null,
		...answer,
	})

describe('caseToRawPost', () => {
	test('link de candidatura fora do texto volta como cartão anexado (ou link da lista, numa vaga de lista)', () => {
		const withCard = { ...item, aiOutput: { ...item.aiOutput, applyLink: 'https://vagas.exemplo.com/1' } }
		expect(caseToRawPost(withCard)).toMatchObject({ attachedLink: 'https://vagas.exemplo.com/1', jobLink: null })

		const fromList = { ...withCard, post: { ...withCard.post, sourcePostId: 'urn:li:activity:9' } }
		expect(caseToRawPost(fromList)).toMatchObject({ attachedLink: null, jobLink: 'https://vagas.exemplo.com/1' })
	})

	test('link escrito no texto fica com a IA', () => {
		const inText = {
			...item,
			post: { ...item.post, text: `${text} https://acme.com/vaga` },
			aiOutput: { ...item.aiOutput, applyLink: 'https://acme.com/vaga' },
		}
		expect(caseToRawPost(inText)).toMatchObject({ attachedLink: null, jobLink: null })
	})
})

test('runFromModel aplica a confiança mínima e as regras do post (tecnologia fora do texto sai)', () => {
	const run = runFromModel(item, modelAnswer({ necessary_knowledge: ['Vue.js', 'React'] }))
	expect(run.isJob).toBe(true)
	expect(run.fields?.necessaryKnowledge).toEqual(['Vue.js'])

	expect(runFromModel(item, modelAnswer({ postType: 'job_seeker' })).isJob).toBe(false)
	expect(runFromModel(item, null)).toEqual({ isJob: false, fields: null })
})

test('sameFieldValue ignora maiúsculas, espaços, ordem das listas e barra no fim do link', () => {
	expect(sameFieldValue('company', 'Acme  Ltda', ' acme ltda')).toBe(true)
	expect(sameFieldValue('necessaryKnowledge', ['Vue.js', 'TypeScript'], ['typescript', 'vue.js'])).toBe(true)
	expect(sameFieldValue('necessaryKnowledge', [], null)).toBe(true)
	expect(sameFieldValue('applyLink', 'https://a.com/vaga/', 'https://a.com/vaga')).toBe(true)
	expect(sameFieldValue('company', 'Acme', null)).toBe(false)
})

test('latestPerPost fica com a última correção de cada post', () => {
	const second = { ...item, correctedFields: ['location'] }
	expect(latestPerPost([item, { ...item, postId: 'outro' }, second])).toEqual([second, { ...item, postId: 'outro' }])
})

describe('scoreCases', () => {
	const notAJob: ExtractionCase = { ...item, postId: 'p2', kind: 'not-a-job', expected: null, correctedFields: [] }

	test('acerto por campo da extração original e da atual', () => {
		const report = scoreCases([
			{ item, run: runFromModel(item, modelAnswer({})) },
			{ item: notAJob, run: { isJob: false, fields: null } },
		])

		expect(report.cases).toBe(2)
		// A extração original virou vaga nos dois casos; a atual acerta o "não é vaga"
		expect(report.isJob).toEqual({ original: { correct: 1, total: 2 }, current: { correct: 2, total: 2 } })
		// Os campos só contam nos casos de vaga
		expect(report.fields.company).toEqual({ original: { correct: 0, total: 1 }, current: { correct: 1, total: 1 } })
		expect(report.fields.necessaryKnowledge.current).toEqual({ correct: 1, total: 1 })
		expect(report.fields.title).toEqual({ original: { correct: 1, total: 1 }, current: { correct: 1, total: 1 } })
	})

	test('sem resposta do modelo, todos os campos contam como errados', () => {
		const report = scoreCases([{ item, run: { isJob: false, fields: null } }])
		expect(report.fields.title.current).toEqual({ correct: 0, total: 1 })
	})

	test('groupByArea separa dev das outras áreas e tira o grupo vazio', () => {
		const dev = { item, run: { isJob: true, fields } }
		const marketing = { item: { ...item, area: 'marketing' }, run: { isJob: true, fields } }
		const saude = { item: { ...item, area: 'saude' }, run: { isJob: true, fields } }

		expect(groupByArea([marketing, dev, saude])).toEqual([
			['dev', [dev]],
			['outras áreas', [marketing, saude]],
		])
		expect(groupByArea([dev])).toEqual([['dev', [dev]]])
	})

	test('formatReport mostra uma linha por campo', () => {
		const table = formatReport(scoreCases([{ item, run: runFromModel(item, modelAnswer({})) }]))
		expect(table.split('\n')).toHaveLength(10)
		expect(table).toMatch(/company\s+0% \(0\)\s+100% \(1\)\s+1/)
	})
})
