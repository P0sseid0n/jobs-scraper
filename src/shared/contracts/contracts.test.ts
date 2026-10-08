import { describe, expect, test } from 'bun:test'

import { CvRequestSchema } from './cv'
import { ProcessedJobSchema } from './job'
import { RawPostSchema } from './raw-post'

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

	test('CvRequest leva a fila de resposta e um contexto livre, sem nada específico de um canal', () => {
		const request = { postId: 'abc', requestedBy: 'user-1', requestedAt: new Date().toISOString() }

		expect(CvRequestSchema.parse({ ...request, replyTo: { queue: 'telegram-cv' } }).replyTo.context).toEqual({})
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'discord-cv', context: { token: 'x' } } }).success).toBe(true)
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'Fila Inválida' } }).success).toBe(false)
	})
})
