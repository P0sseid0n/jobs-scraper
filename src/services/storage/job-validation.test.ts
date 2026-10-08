import { describe, expect, test } from 'bun:test'

import type { ProcessedJob } from '@shared/contracts'

import { missingRequiredFields } from './job-validation'

const job: ProcessedJob = {
	postId: 'urn:li:share:1',
	rawContent: 'Vaga',
	title: 'Dev Vue',
	company: null,
	location: null,
	link: 'https://www.linkedin.com/feed/update/urn:li:share:1/',
	necessary_knowledge: null,
	recruiter_email: null,
	workMode: null,
	aiJobConfidence: 80,
	postedAt: null,
	author: null,
}

describe('missingRequiredFields', () => {
	test('empresa, local e modalidade são opcionais', () => {
		expect(missingRequiredFields(job)).toEqual([])
	})

	test('e-mail substitui o link como forma de candidatura', () => {
		expect(missingRequiredFields({ ...job, link: null, recruiter_email: 'rh@empresa.com' })).toEqual([])
	})

	test('exige cargo e alguma forma de candidatura', () => {
		expect(missingRequiredFields({ ...job, title: null, link: null })).toEqual(['title', 'link ou recruiter_email'])
	})
})
