import { describe, expect, test } from 'bun:test'

import { JobCorrectionSchema, jobFields } from '@shared/contracts'

import { HttpError } from './http'
import { planCorrection } from './job-correction'
import type { JobDocument } from './jobs-query'

const NOW = new Date('2026-10-12T12:00:00.000Z')

const doc: JobDocument = {
	postId: 'urn:li:activity:1',
	rawContent: 'Vaga de Front-end na Acme. Híbrido em SP. Vue.js e TypeScript. CLT.',
	title: 'Front-end',
	company: 'Recrutadora X',
	location: 'São Paulo, SP',
	applyLink: null,
	necessaryKnowledge: ['Vue.js'],
	recruiterEmail: null,
	workMode: 'remoto',
	contractTypes: ['clt'],
	aiJobConfidence: 90,
	postedAt: '2026-10-10T10:00:00.000Z',
	author: 'Ana',
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
	extractionModel: 'gemma3:4b',
	promptVersion: 'abc123',
}

const plan = (body: unknown, job = doc) => planCorrection(job, JobCorrectionSchema.parse(body), NOW)

describe('planCorrection', () => {
	test('primeira correção: grava os valores certos, a data e a extração original da IA', () => {
		const { set } = plan({ company: 'Acme', workMode: 'hibrido', necessaryKnowledge: ['Vue.js', 'TypeScript'] })

		expect(set).toEqual({
			company: 'Acme',
			workMode: 'hibrido',
			necessaryKnowledge: ['Vue.js', 'TypeScript'],
			correctedAt: NOW,
			aiExtraction: jobFields(doc),
		})
	})

	test('registro de feedback: post, saída da IA, valores certos, modelo e versão do prompt', () => {
		const { feedback } = plan({ company: 'Acme', workMode: 'hibrido' })

		expect(feedback).toEqual({
			postId: doc.postId,
			kind: 'fields',
			post: { text: doc.rawContent, author: 'Ana', url: doc.postLink, postedAt: doc.postedAt, sourcePostId: null },
			aiOutput: { ...jobFields(doc), aiJobConfidence: 90 },
			expected: { ...jobFields(doc), company: 'Acme', workMode: 'hibrido' },
			correctedFields: ['company', 'workMode'],
			model: 'gemma3:4b',
			promptVersion: 'abc123',
			createdAt: NOW,
		})
	})

	test('campo enviado com o mesmo valor não conta como corrigido', () => {
		const { set, feedback } = plan({ title: 'Front-end', company: 'Acme' })

		expect(feedback.correctedFields).toEqual(['company'])
		expect(set).not.toHaveProperty('title')
	})

	test('nada mudou → 400', () => {
		expect(() => plan({ title: 'Front-end', necessaryKnowledge: ['Vue.js'] })).toThrow(HttpError)
	})

	test('segunda correção mantém a extração da IA guardada na primeira', () => {
		const original = jobFields(doc)
		const corrected: JobDocument = { ...doc, company: 'Acme', aiExtraction: original, correctedAt: new Date('2026-10-11') }
		const { set, feedback } = plan({ location: 'Campinas, SP' }, corrected)

		expect(set).not.toHaveProperty('aiExtraction')
		expect(feedback.aiOutput).toEqual({ ...original, aiJobConfidence: 90 })
		expect(feedback.expected).toEqual({ ...original, company: 'Acme', location: 'Campinas, SP' })
		expect(feedback.correctedFields).toEqual(['location'])
	})

	test('"não é vaga": marca a vaga, guarda a extração e registra sem valores certos', () => {
		const { set, feedback } = plan({ notAJob: true })

		expect(set).toEqual({ notAJob: true, correctedAt: NOW, aiExtraction: jobFields(doc) })
		expect(feedback).toMatchObject({ kind: 'not-a-job', expected: null, correctedFields: [] })
	})

	test('vaga salva antes dos campos de modelo e prompt: registra null', () => {
		const { extractionModel, promptVersion, ...old } = doc
		const { feedback } = plan({ company: 'Acme' }, old)

		expect(feedback.model).toBeNull()
		expect(feedback.promptVersion).toBeNull()
	})
})
