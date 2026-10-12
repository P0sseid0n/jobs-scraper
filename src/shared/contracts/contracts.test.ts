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
			applyLink: null,
			necessaryKnowledge: null,
			recruiterEmail: null,
			workMode: 'home office',
			aiJobConfidence: 50,
		}

		expect(ProcessedJobSchema.safeParse(job).success).toBe(false)
		expect(ProcessedJobSchema.safeParse({ ...job, workMode: 'remoto' }).success).toBe(true)
	})

	test('ProcessedJob sem regime (mensagem antiga) vira null; regime desconhecido é rejeitado', () => {
		const job = {
			postId: 'abc',
			rawContent: 'vaga',
			title: null,
			company: null,
			location: null,
			applyLink: null,
			necessaryKnowledge: null,
			recruiterEmail: null,
			workMode: null,
			aiJobConfidence: 50,
		}

		expect(ProcessedJobSchema.parse(job).contractTypes).toBeNull()
		expect(ProcessedJobSchema.parse({ ...job, contractTypes: ['clt', 'pj'] }).contractTypes).toEqual(['clt', 'pj'])
		expect(ProcessedJobSchema.safeParse({ ...job, contractTypes: ['temporario'] }).success).toBe(false)
	})

	test('ProcessedJob sem nível (mensagem antiga) vira null; nível desconhecido é rejeitado', () => {
		const job = {
			postId: 'abc',
			rawContent: 'vaga',
			title: null,
			company: null,
			location: null,
			applyLink: null,
			necessaryKnowledge: null,
			recruiterEmail: null,
			workMode: null,
			aiJobConfidence: 50,
		}

		expect(ProcessedJobSchema.parse(job).seniorities).toBeNull()
		expect(ProcessedJobSchema.parse({ ...job, seniorities: ['pleno', 'senior'] }).seniorities).toEqual(['pleno', 'senior'])
		expect(ProcessedJobSchema.safeParse({ ...job, seniorities: ['trainee'] }).success).toBe(false)
	})

	test('CvRequest leva a fila de resposta e um contexto livre, sem nada específico de um canal', () => {
		const request = { postId: 'abc', requestedBy: 'user-1', requestedAt: new Date().toISOString() }

		expect(CvRequestSchema.parse({ ...request, replyTo: { queue: 'telegram-cv' } }).replyTo.context).toEqual({})
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'discord-cv', context: { token: 'x' } } }).success).toBe(true)
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'Fila Inválida' } }).success).toBe(false)
	})
})
