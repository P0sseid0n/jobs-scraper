import { describe, expect, test } from 'bun:test'

import { JobsViewedSchema, JobViewedSchema, viewedFilter } from './job-viewed'
import { LISTABLE_JOBS } from './jobs-query'

describe('viewedFilter', () => {
	test('marcar: só as vagas listáveis ainda não vistas (a data da primeira vez fica)', () => {
		expect(viewedFilter(['p1', 'p2'], true)).toEqual({
			...LISTABLE_JOBS,
			postId: { $type: 'string', $in: ['p1', 'p2'] },
			viewedAt: null,
		})
	})

	test('desmarcar: só as que estão vistas', () => {
		expect(viewedFilter(['p1'], false)).toEqual({
			...LISTABLE_JOBS,
			postId: { $type: 'string', $in: ['p1'] },
			viewedAt: { $type: 'date' },
		})
	})
})

describe('corpo das rotas', () => {
	test('PUT /api/jobs/:postId/viewed pede `viewed` booleano', () => {
		expect(JobViewedSchema.parse({ viewed: false })).toEqual({ viewed: false })
		expect(JobViewedSchema.safeParse({ viewed: 'true' }).success).toBe(false)
		expect(JobViewedSchema.safeParse({}).success).toBe(false)
	})

	test('PUT /api/jobs/viewed pede de 1 a 2.000 vagas', () => {
		expect(JobsViewedSchema.parse({ postIds: ['p1'], viewed: true })).toEqual({ postIds: ['p1'], viewed: true })
		expect(JobsViewedSchema.safeParse({ postIds: [], viewed: true }).success).toBe(false)
		expect(JobsViewedSchema.safeParse({ postIds: [''], viewed: true }).success).toBe(false)
		expect(JobsViewedSchema.safeParse({ postIds: Array.from({ length: 2_001 }, (_, i) => `p${i}`), viewed: true }).success).toBe(
			false,
		)
	})
})
