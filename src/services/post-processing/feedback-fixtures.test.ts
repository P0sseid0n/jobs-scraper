import { describe, expect, test } from 'bun:test'

import { jobFields } from '@shared/contracts'

import type { ExtractionCase } from './extraction-eval'
import { anonymizeCase, findPersonalData, fixtureProblems, mergeFixtures, readFixtures } from './feedback-fixtures'

const item: ExtractionCase = {
	postId: 'urn:li:activity:7515393090820456448',
	anonymized: false,
	area: 'dev',
	kind: 'fields',
	post: {
		text: 'Oi, aqui é a Mariana Lima! Vaga Front-end. Currículos para mariana@acme.com ou vagas@acme.com, WhatsApp (11) 98765-4321. Perfil: https://www.linkedin.com/in/mariana-lima-123 Portfólio: https://lnkd.in/di7FF9Df',
		author: 'Mariana Lima',
		url: 'https://www.linkedin.com/feed/update/urn:li:activity:7515393090820456448',
		postedAt: '2026-10-10T10:00:00.000Z',
		sourcePostId: null,
	},
	aiOutput: { ...jobFields({ title: 'Front-end', company: 'Acme', recruiterEmail: 'mariana@acme.com' }) },
	expected: jobFields({ title: 'Front-end', company: 'Acme', recruiterEmail: 'vagas@acme.com' }),
	correctedFields: ['recruiterEmail'],
	model: 'gemma3:4b',
	promptVersion: 'abc',
}

describe('anonymizeCase', () => {
	const anonymized = anonymizeCase(item)

	test('troca e-mails de forma consistente no texto e nos campos', () => {
		expect(anonymized.post.text).toContain('contato1@exemplo.com ou contato2@exemplo.com')
		expect(anonymized.aiOutput.recruiterEmail).toBe('contato1@exemplo.com')
		expect(anonymized.expected?.recruiterEmail).toBe('contato2@exemplo.com')
	})

	test('tira o nome de quem postou, perfis e links curtos do LinkedIn, telefones e os ids do post', () => {
		expect(anonymized.post.text).toStartWith('Oi, aqui é a Autor do post!')
		expect(anonymized.post.text).not.toContain('Mariana')
		expect(anonymized.post.text).toContain('linkedin.com/in/perfil')
		expect(anonymized.post.text).toContain('https://lnkd.in/link')
		expect(anonymized.post.text).toContain('(11) 90000-0000')
		expect(anonymized.post.author).toBe('Autor do post')
		expect(anonymized.post.url).toBeNull()
		expect(anonymized.postId).toMatch(/^caso-[a-f0-9]{12}$/)
		// O texto ainda precisa ser reescrito à mão
		expect(anonymized.anonymized).toBe(false)
	})

	test('mantém o resto do caso', () => {
		expect(anonymized).toMatchObject({ kind: 'fields', correctedFields: ['recruiterEmail'], model: 'gemma3:4b' })
		expect(anonymized.expected?.company).toBe('Acme')
		expect(anonymized.aiOutput.title).toBe('Front-end')
	})

	test('o caso anonimizado não tem dados pessoais; o original tem', () => {
		expect(findPersonalData(anonymized)).toEqual([])
		expect(findPersonalData(item).length).toBeGreaterThan(0)
	})

	test('anonimizar de novo não muda nada', () => {
		expect(anonymizeCase({ ...anonymized, postId: item.postId })).toEqual(anonymized)
	})
})

test('mergeFixtures substitui o mesmo caso e mantém os outros', () => {
	const a = anonymizeCase(item)
	const b = { ...a, postId: 'caso-outro' }
	const updated = { ...a, correctedFields: ['company'] }

	expect(mergeFixtures([a, b], [updated])).toEqual({ fixtures: [updated, b], kept: [] })
})

test('mergeFixtures não substitui um caso reescrito à mão', () => {
	const rewritten = { ...anonymizeCase(item), anonymized: true, post: { ...anonymizeCase(item).post, text: 'Texto reescrito' } }

	expect(mergeFixtures([rewritten], [anonymizeCase(item)])).toEqual({ fixtures: [rewritten], kept: [rewritten.postId] })
})

test('fixtureProblems aponta texto não reescrito e dados pessoais', () => {
	const rewritten = { ...anonymizeCase(item), anonymized: true }

	expect(fixtureProblems([rewritten])).toEqual([])
	expect(fixtureProblems([anonymizeCase(item)])).toEqual([{ postId: rewritten.postId, problems: ['anonymized: false'] }])
	expect(fixtureProblems([{ ...item, anonymized: true }])[0]?.problems.length).toBeGreaterThan(0)
})

test('fixtureProblems aceita o e-mail de exemplo no começo de uma linha', () => {
	const rewritten = { ...anonymizeCase(item), anonymized: true }
	const post = { ...rewritten.post, text: 'Envie o currículo para:\ncontato1@exemplo.com' }

	expect(fixtureProblems([{ ...rewritten, post }])).toEqual([])
	expect(findPersonalData({ ...rewritten, post: { ...post, text: 'Envie para:\nana@empresa.com' } })).toEqual(['ana@empresa.com'])
})

test('as fixtures versionadas são válidas, foram reescritas à mão e não têm dados pessoais', async () => {
	expect(fixtureProblems(await readFixtures())).toEqual([])
})
