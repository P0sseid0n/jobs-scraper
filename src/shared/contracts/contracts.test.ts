import { describe, expect, test } from 'bun:test'

import { CV_BASE_TEX_MAX_BYTES, CvBaseValidationRequestSchema, CvImportResultSchema, CvRequestSchema } from './cv'
import { CvFormSchema } from './cv-form'
import { ProcessedJobSchema } from './job'
import { MailRequestSchema, MailResultSchema } from './mail'
import { RawPostSchema } from './raw-post'
import { ScraperRunEventSchema } from './scraper-run'

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
		}

		expect(ProcessedJobSchema.parse(job).contractTypes).toBeNull()
		expect(ProcessedJobSchema.parse({ ...job, contractTypes: ['clt', 'pj'] }).contractTypes).toEqual(['clt', 'pj'])
		expect(ProcessedJobSchema.safeParse({ ...job, contractTypes: ['temporario'] }).success).toBe(false)
	})

	test('CvRequest leva a fila de resposta e um contexto livre, sem nada específico de um canal', () => {
		const request = { postId: 'abc', requestedBy: 'user-1', requestedAt: new Date().toISOString() }

		expect(CvRequestSchema.parse({ ...request, replyTo: { queue: 'telegram-cv' } }).replyTo.context).toEqual({})
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'discord-cv', context: { token: 'x' } } }).success).toBe(true)
		expect(CvRequestSchema.safeParse({ ...request, replyTo: { queue: 'Fila Inválida' } }).success).toBe(false)
	})

	test('a validação do currículo base recusa .tex vazio ou acima do limite (contado em bytes)', () => {
		const replyTo = { queue: 'web-cv-base', context: {} }
		const validation = { validationId: 'v1', tex: '\\documentclass{article}', replyTo, requestedAt: new Date().toISOString() }

		expect(CvBaseValidationRequestSchema.safeParse(validation).success).toBe(true)
		expect(CvBaseValidationRequestSchema.safeParse({ ...validation, tex: '   ' }).success).toBe(false)
		expect(CvBaseValidationRequestSchema.safeParse({ ...validation, tex: 'é'.repeat(CV_BASE_TEX_MAX_BYTES / 2 + 1) }).success).toBe(
			false,
		)
	})

	test('CvImportResult aceita o formulário sem o nome, que a pessoa completa antes de salvar', () => {
		const form = {
			contact: { name: '', headline: '', location: '', email: '', phone: '', links: [] },
			sections: [{ kind: 'education', title: '', entries: [{ course: 'Enfermagem', institution: '', period: '' }] }],
		}

		expect(CvImportResultSchema.safeParse({ importId: 'i1', context: {}, form, error: null }).success).toBe(true)
		expect(CvFormSchema.safeParse(form).success).toBe(false)
	})

	test('MailRequest leva o e-mail revisado, o PDF por referência e a fila de resposta', () => {
		const request = {
			mailId: 'm1',
			postId: 'abc',
			to: '  rh@acme.com.br ',
			subject: 'Candidatura\n– Dev Vue',
			body: '  Olá!\n\nSegue o currículo.  ',
			attachment: { fileId: 'f1' },
			requestedBy: 'web',
			replyTo: { queue: 'web-mail', context: { mailId: 'm1' } },
			requestedAt: new Date().toISOString(),
		}

		expect(MailRequestSchema.parse(request)).toMatchObject({
			to: 'rh@acme.com.br',
			subject: 'Candidatura – Dev Vue',
			body: 'Olá!\n\nSegue o currículo.',
		})
		expect(MailRequestSchema.safeParse({ ...request, to: 'não é e-mail' }).success).toBe(false)
		expect(MailRequestSchema.safeParse({ ...request, subject: ' \n ' }).success).toBe(false)
		expect(MailRequestSchema.safeParse({ ...request, body: '' }).success).toBe(false)
		// O PDF nunca vai na mensagem: só a referência
		expect(MailRequestSchema.safeParse({ ...request, attachment: { base64: 'JVBERi0=' } }).success).toBe(false)
	})

	test('MailResult é enviado ou falhou, com o motivo e o contexto de quem pediu', () => {
		const result = { mailId: 'm1', postId: 'abc', context: { token: 'x' }, sentAt: null }

		expect(MailResultSchema.safeParse({ ...result, status: 'failed', error: 'SMTP 550' }).success).toBe(true)
		expect(MailResultSchema.safeParse({ ...result, status: 'sending', error: null }).success).toBe(false)
	})

	test('ScraperRunEvent: o início vem em andamento e o fim, com o status final', () => {
		const run = { runId: 'r1', trigger: 'manual' }

		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'started', status: 'running' }).success).toBe(true)
		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'finished', status: 'success' }).success).toBe(true)
		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'finished', status: 'failed' }).success).toBe(true)
		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'started', status: 'success' }).success).toBe(false)
		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'finished', status: 'running' }).success).toBe(false)
		expect(ScraperRunEventSchema.safeParse({ ...run, phase: 'started', status: 'running', trigger: 'discord' }).success).toBe(false)
		expect(ScraperRunEventSchema.safeParse({ ...run, runId: '', phase: 'started', status: 'running' }).success).toBe(false)
	})
})
