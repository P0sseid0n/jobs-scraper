import { describe, expect, test } from 'bun:test'

import type { WebJob } from '../../api-types'
import { DEFAULT_FILTERS, hasActiveFilters, matchesFilters } from './job-filters'

const job: WebJob = {
	postId: 'p1',
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme',
	location: 'São Paulo, SP',
	workMode: 'hibrido',
	contractTypes: ['clt', 'pj'],
	seniorities: ['pleno'],
	necessaryKnowledge: ['Vue.js', 'TypeScript'],
	applyLink: null,
	recruiterEmail: null,
	author: 'Ana',
	postedAt: null,
	createdAt: '2026-10-10T11:00:00.000Z',
	aiJobConfidence: 80,
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/x',
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

	test('regime: qualquer um dos escolhidos; "none" pega as vagas sem regime', () => {
		expect(matches({ contractType: ['pj'] })).toBe(true)
		expect(matches({ contractType: ['estagio'] })).toBe(false)
		expect(matches({ contractType: ['none'] })).toBe(false)
		expect(matchesFilters({ ...job, contractTypes: null }, { ...DEFAULT_FILTERS, contractType: ['none'] }, now)).toBe(true)
		expect(matchesFilters({ ...job, contractTypes: null }, { ...DEFAULT_FILTERS, contractType: ['clt'] }, now)).toBe(false)
	})

	test('nível: qualquer um dos escolhidos; "none" pega as vagas sem nível', () => {
		expect(matches({ seniority: ['pleno', 'senior'] })).toBe(true)
		expect(matches({ seniority: ['junior'] })).toBe(false)
		expect(matchesFilters({ ...job, seniorities: null }, { ...DEFAULT_FILTERS, seniority: ['none'] }, now)).toBe(true)
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
	expect(hasActiveFilters({ ...DEFAULT_FILTERS, contractType: ['pj'] })).toBe(true)
	expect(hasActiveFilters({ ...DEFAULT_FILTERS, seniority: ['senior'] })).toBe(true)
})
