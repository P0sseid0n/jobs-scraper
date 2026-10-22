import { describe, expect, test } from 'bun:test'

import type { RawPost } from '@shared/contracts'

import { AiJobOutputSchema } from './extraction-output'
import { buildProcessedJob } from './job-extraction'

const post: RawPost = {
	postId: 'urn:li:activity:1',
	text: 'Estamos contratando Desenvolvedor Front-end Pleno na Acme, CLT. Requisitos: Vue.js e TypeScript. https://acme.com/vagas/1',
	url: null,
	author: 'Ana',
	postedAt: null,
	scrapedAt: new Date(0).toISOString(),
	sourcePostId: null,
	jobLink: null,
	attachedLink: null,
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

	test('campo que a IA deixou vazio não conta', () => {
		expect(checksFor({ title: 'Desenvolvedor Front-end' })).toEqual([])
	})
})
