import { describe, expect, test } from 'bun:test'

import type { WebJob } from '../../api-types'
import { DEFAULT_FILTERS, hasActiveFilters, matchesFilters } from './job-filters'

const job: WebJob = {
	postId: 'p1',
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme',
	location: 'São Paulo, SP',
	workMode: 'hibrido',
	necessary_knowledge: ['Vue.js', 'TypeScript'],
	link: 'https://www.linkedin.com/x',
	recruiter_email: null,
	author: 'Ana',
	postedAt: null,
	createdAt: '2026-10-10T11:00:00.000Z',
	aiJobConfidence: 80,
	language: 'pt',
	rawContent: 'Vaga com Nuxt',
}

const now = new Date('2026-10-10T12:00:00.000Z').getTime()
const matches = (filters: Partial<typeof DEFAULT_FILTERS>) => matchesFilters(job, { ...DEFAULT_FILTERS, ...filters }, now)

describe('matchesFilters (vagas que chegam em tempo real)', () => {
	test('sem filtros, toda vaga entra', () => {
		expect(matches({})).toBe(true)
	})

	test('busca no texto do post e nas tecnologias, sem diferenciar maiúsculas', () => {
		expect(matches({ q: 'nuxt' })).toBe(true)
		expect(matches({ q: 'typescript' })).toBe(true)
		expect(matches({ q: 'angular' })).toBe(false)
	})

	test('modalidade, tecnologias, e-mail, idioma, confiança e período', () => {
		expect(matches({ workMode: ['remoto'] })).toBe(false)
		expect(matches({ workMode: ['hibrido', 'none'] })).toBe(true)
		expect(matches({ skills: ['vue.js'] })).toBe(true)
		expect(matches({ skills: ['vue.js', 'react'] })).toBe(false)
		expect(matches({ hasEmail: true })).toBe(false)
		expect(matches({ language: 'en' })).toBe(false)
		expect(matches({ minConfidence: 85 })).toBe(false)
		expect(matches({ since: '24h' })).toBe(true)
		expect(matchesFilters({ ...job, createdAt: '2026-10-01T00:00:00.000Z' }, { ...DEFAULT_FILTERS, since: '7d' }, now)).toBe(false)
	})
})

test('hasActiveFilters', () => {
	expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
	expect(hasActiveFilters({ ...DEFAULT_FILTERS, workMode: ['remoto'] })).toBe(true)
})
