import { describe, expect, test } from 'bun:test'

import type { ProcessedJob } from '@shared/contracts'

import { missingRequiredFields } from './job-validation'

const job: ProcessedJob = {
	postId: 'urn:li:share:1',
	rawContent: 'Vaga',
	title: 'Dev Vue',
	company: null,
	location: null,
	applyLink: null,
	necessaryKnowledge: null,
	recruiterEmail: null,
	workMode: null,
	contractTypes: null,
	aiJobConfidence: 80,
	postedAt: null,
	author: null,
	language: null,
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/feed/update/urn:li:share:1/',
}

describe('missingRequiredFields', () => {
	test('empresa, local e modalidade são opcionais', () => {
		expect(missingRequiredFields(job)).toEqual([])
	})

	test('site e e-mail são opcionais: o post já é uma forma de candidatura', () => {
		expect(missingRequiredFields({ ...job, applyLink: null, recruiterEmail: null })).toEqual([])
	})

	test('exige cargo e o link do post', () => {
		const withEverythingElse = { ...job, applyLink: 'https://empresa.com/vagas/1', recruiterEmail: 'rh@empresa.com' }

		expect(missingRequiredFields({ ...withEverythingElse, title: null, postLink: null })).toEqual(['title', 'postLink'])
	})
})
