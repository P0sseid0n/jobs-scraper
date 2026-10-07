import { describe, expect, test } from 'bun:test'
import { ProcessedJobSchema, RawPostSchema } from '../src/types/messages'

describe('contratos das filas', () => {
	test('RawPost exige postId, texto e data ISO', () => {
		expect(RawPostSchema.safeParse({ postId: 'abc', text: 'vaga', scrapedAt: new Date().toISOString() }).success).toBe(true)
		expect(RawPostSchema.safeParse('texto solto').success).toBe(false)
	})

	test('ProcessedJob rejeita workMode desconhecido', () => {
		const job = {
			postId: 'abc',
			rawContent: 'vaga',
			title: null,
			company: null,
			location: null,
			link: null,
			necessary_knowledge: null,
			recruiter_email: null,
			workMode: 'home office',
			aiJobConfidence: 50,
		}

		expect(ProcessedJobSchema.safeParse(job).success).toBe(false)
		expect(ProcessedJobSchema.safeParse({ ...job, workMode: 'remoto' }).success).toBe(true)
	})
})
