import { describe, expect, test } from 'bun:test'

import type { WebJob } from '../../api-types'
import { DEFAULT_FILTERS, hasActiveFilters, jobFiltersSearch, matchesFilters, type JobFilters } from './job-filters'

const job: WebJob = {
	postId: 'p1',
	title: 'Desenvolvedor(a) Front-end Pleno',
	company: 'Acme',
	location: 'São Paulo, SP',
	workMode: 'hibrido',
	contractTypes: ['clt', 'pj'],
	necessaryKnowledge: ['Vue.js', 'TypeScript'],
	applyLink: null,
	recruiterEmail: null,
	author: 'Ana',
	postedAt: null,
	createdAt: '2026-10-10T11:00:00.000Z',
	extractionChecks: [],
	needsReview: false,
	language: 'pt',
	sourcePostId: null,
	postLink: 'https://www.linkedin.com/x',
	rawContent: 'Vaga com Nuxt',
	imageCount: 0,
	imageText: null,
	correctedAt: null,
	viewedAt: null,
	reposts: [],
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

	test('modalidade, tecnologias, e-mail, idioma, confiança e período', () => {
		expect(matches({ workMode: ['remoto'] })).toBe(false)
		expect(matches({ workMode: ['hibrido', 'none'] })).toBe(true)
		expect(matches({ skills: ['vue.js'] })).toBe(true)
		expect(matches({ skills: ['vue.js', 'react'] })).toBe(false)
		expect(matches({ hasEmail: true })).toBe(false)
		expect(matches({ language: 'en' })).toBe(false)
		expect(matches({ since: '24h' })).toBe(true)
		expect(matchesFilters({ ...job, createdAt: '2026-10-01T00:00:00.000Z' }, { ...DEFAULT_FILTERS, since: '7d' }, now)).toBe(false)
	})

	test('"só não vistas": a vaga já aberta no site fica de fora', () => {
		expect(matches({ unviewed: true })).toBe(true)
		expect(matchesFilters({ ...job, viewedAt: '2026-10-10T11:30:00.000Z' }, { ...DEFAULT_FILTERS, unviewed: true }, now)).toBe(false)
		expect(matchesFilters({ ...job, viewedAt: '2026-10-10T11:30:00.000Z' }, DEFAULT_FILTERS, now)).toBe(true)
	})
})

test('hasActiveFilters', () => {
	expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false)
	expect(hasActiveFilters({ ...DEFAULT_FILTERS, workMode: ['remoto'] })).toBe(true)
	expect(hasActiveFilters({ ...DEFAULT_FILTERS, contractType: ['pj'] })).toBe(true)
})

describe('jobFiltersSearch (os filtros da URL)', () => {
	test('sem parâmetros, são os filtros padrão', () => {
		expect(jobFiltersSearch.parse({})).toEqual(DEFAULT_FILTERS)
	})

	test('mantém os valores válidos', () => {
		const search = {
			q: 'react',
			workMode: ['remoto', 'none'],
			contractType: ['pj'],
			since: '7d',
			hasEmail: true,
			unviewed: true,
		} satisfies Partial<JobFilters>
		expect(jobFiltersSearch.parse(search)).toEqual({ ...DEFAULT_FILTERS, ...search })
	})

	test('valor inválido (link antigo, URL editada à mão) vira o padrão, sem derrubar os outros', () => {
		const parsed = jobFiltersSearch.parse({ q: 'vue', workMode: ['marte'], since: 'ontem', hasEmail: 'sim' })

		expect(parsed).toEqual({ ...DEFAULT_FILTERS, q: 'vue' })
	})
})
