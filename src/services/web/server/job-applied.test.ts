import { describe, expect, test } from 'bun:test'

import { JobAppliedSchema, looksLikeSameJob } from './job-applied'

const job = { postId: 'p1', title: 'Desenvolvedor Front-end Pleno', company: 'Acme Tecnologia Ltda.', applyLink: null }

describe('looksLikeSameJob', () => {
	test('a mesma empresa (com outra grafia) e o mesmo cargo', () => {
		expect(looksLikeSameJob(job, { ...job, postId: 'p2', title: 'Desenvolvedora Frontend Pleno', company: 'ACME Tecnologia' })).toBe(
			true,
		)
	})

	test('o mesmo link de candidatura específico, mesmo sem a empresa', () => {
		const link = 'https://acme.gupy.io/jobs/123?utm_source=linkedin'

		expect(
			looksLikeSameJob({ ...job, company: null, applyLink: link }, { ...job, postId: 'p2', company: null, applyLink: link }),
		).toBe(true)
	})

	test('cargo de outro nível, outra empresa ou sem empresa não são a mesma vaga', () => {
		expect(looksLikeSameJob(job, { ...job, postId: 'p2', title: 'Desenvolvedor Front-end Sênior' })).toBe(false)
		expect(looksLikeSameJob(job, { ...job, postId: 'p2', company: 'Outra' })).toBe(false)
		expect(looksLikeSameJob({ ...job, company: null }, { ...job, postId: 'p2', company: null })).toBe(false)
	})

	test('a própria vaga não conta', () => {
		expect(looksLikeSameJob(job, job)).toBe(false)
	})
})

test('PUT /api/jobs/:postId/applied pede `applied` booleano', () => {
	expect(JobAppliedSchema.parse({ applied: true })).toEqual({ applied: true })
	expect(JobAppliedSchema.safeParse({ applied: 'true' }).success).toBe(false)
	expect(JobAppliedSchema.safeParse({}).success).toBe(false)
})
