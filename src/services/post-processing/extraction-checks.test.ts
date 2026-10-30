import { describe, expect, test } from 'bun:test'

import type { RawPost } from '@shared/contracts'

import { AiJobOutputSchema } from './extraction-output'
import { buildProcessedJob } from './job-extraction'

const post: RawPost = {
	postId: 'urn:li:activity:1',
	text: 'Estamos contratando Desenvolvedor Front-end Pleno na Acme, CLT. Requisitos: Vue.js e TypeScript. https://acme.com/vagas/1',
	url: null,
	author: 'Ana',
	authorIsCompany: false,
	postedAt: null,
	scrapedAt: new Date(0).toISOString(),
	sourcePostId: null,
	jobLink: null,
	attachedLink: null,
	images: [],
	reprocessId: null,
}

const checksFor = (answer: Record<string, unknown>) =>
	buildProcessedJob(post, AiJobOutputSchema.parse({ postType: 'job_opening', ...answer }), 'pt').extractionChecks

describe('extractionChecks', () => {
	test('sem checks quando tudo o que a IA citou está no post', () => {
		const checks = checksFor({
			title: 'Desenvolvedor Front-end Pleno',
			company: 'Acme',
			contractTypes: ['clt'],
			necessary_knowledge: ['Vue.js', 'TypeScript'],
			link: 'https://acme.com/vagas/1',
		})

		expect(checks).toEqual([])
	})

	test('marca cada campo que a IA citou sem estar escrito no post', () => {
		const checks = checksFor({
			title: 'Desenvolvedor Front-end Sênior',
			company: 'Globex',
			workMode: 'remoto',
			contractTypes: ['clt', 'pj'],
			necessary_knowledge: ['Vue.js', 'React'],
			link: 'https://globex.com/jobs',
		})

		expect(checks).toEqual(['title', 'company', 'workMode', 'contractTypes', 'necessaryKnowledge', 'applyLink'])
	})

	test('a empresa da IA que vira o nome da página que postou não conta', () => {
		const job = buildProcessedJob(
			{ ...post, author: 'Acme Soluções em TI', authorIsCompany: true },
			AiJobOutputSchema.parse({ postType: 'job_opening', company: 'Acme' }),
			'pt',
		)

		expect(job.company).toBe('Acme Soluções em TI')
		expect(job.extractionChecks).toEqual([])
	})

	test('tecnologia repetida pela IA com outra grafia não conta', () => {
		const job = buildProcessedJob(
			{ ...post, text: `${post.text} Diferencial: Node.js.` },
			AiJobOutputSchema.parse({ postType: 'job_opening', company: 'Acme', necessary_knowledge: ['Vue.js', 'Node.js', 'Node'] }),
			'pt',
		)

		expect(job.necessaryKnowledge).toEqual(['Vue.js', 'Node.js'])
		expect(job.extractionChecks).toEqual([])
	})

	test('campo que a IA deixou vazio não conta', () => {
		expect(checksFor({ title: 'Desenvolvedor Front-end', company: 'Acme' })).toEqual([])
	})

	test('vaga sem empresa ganha o check da empresa', () => {
		expect(checksFor({ title: 'Desenvolvedor Front-end' })).toEqual(['company'])
	})

	test('empresa confidencial: sem nome e sem o check', () => {
		const text = 'Vaga para Desenvolvedor Front-end Pleno em empresa confidencial do setor financeiro. CLT.'
		const job = buildProcessedJob({ ...post, text }, AiJobOutputSchema.parse({ postType: 'job_opening' }), 'pt')

		expect(job.company).toBeNull()
		expect(job.companyConfidential).toBe(true)
		expect(job.extractionChecks).toEqual([])
	})

	test('"Confidencial" devolvido pela IA não vira o nome da empresa', () => {
		const text = 'Empresa: Confidencial. Vaga para Desenvolvedor Back-end, remoto.'
		const job = buildProcessedJob(
			{ ...post, text },
			AiJobOutputSchema.parse({ postType: 'job_opening', company: 'Confidencial' }),
			'pt',
		)

		expect(job.company).toBeNull()
		expect(job.companyConfidential).toBe(true)
		expect(job.extractionChecks).toEqual([])
	})

	test('com a empresa identificada, vale o nome, mesmo citando um cliente confidencial', () => {
		const text = 'A Acme contrata Desenvolvedor Front-end para atuar em cliente confidencial. CLT.'
		const job = buildProcessedJob({ ...post, text }, AiJobOutputSchema.parse({ postType: 'job_opening', company: 'Acme' }), 'pt')

		expect(job.company).toBe('Acme')
		expect(job.companyConfidential).toBe(false)
		expect(job.extractionChecks).toEqual([])
	})
})
