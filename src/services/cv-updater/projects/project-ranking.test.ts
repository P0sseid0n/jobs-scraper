import { describe, expect, test } from 'bun:test'

import type { ResumeProject } from '../resume/resume.types'
import type { GithubRepo } from './github-repositories'
import { matchingTechnologies, orderTechnologies, rankProjects, scoreTechMatches, selectProjects } from './project-ranking'
import { repoTechnologies } from './tech-catalog'

const repo = (overrides: Partial<GithubRepo>): GithubRepo => ({
	name: 'repo',
	fullName: 'fulano/repo',
	url: 'https://github.com/fulano/repo',
	description: null,
	topics: [],
	language: null,
	pushedAt: '2026-01-01T00:00:00Z',
	stars: 0,
	languages: [],
	dependencies: [],
	readme: '',
	detailsPushedAt: '2026-01-01T00:00:00Z',
	...overrides,
})

const placar = repo({
	name: 'Placar',
	fullName: 'fulano/Placar',
	url: 'https://github.com/fulano/Placar',
	description: 'Placar em tempo real',
	topics: ['nuxt', 'supabase', 'scoreboard', 'typescript'],
	languages: ['Vue', 'TypeScript'],
	dependencies: ['nuxt', '@supabase/supabase-js', 'eslint'],
	pushedAt: '2026-10-01T00:00:00Z',
})

const calculadora = repo({
	name: 'react-calculator',
	fullName: 'fulano/react-calculator',
	languages: ['TypeScript'],
	dependencies: ['react'],
})

const chat = repo({
	name: 'chat-vue',
	fullName: 'fulano/chat-vue',
	description: 'Chat em tempo real',
	languages: ['Vue'],
	dependencies: ['vue', 'pinia', 'firebase'],
	pushedAt: '2023-07-01T00:00:00Z',
})

const texProjects: ResumeProject[] = [
	{
		name: 'Loja Exemplo',
		url: 'github.com/fulano/loja',
		description: 'E-commerce.',
		technologies: ['React', 'Node.js', 'PostgreSQL'],
	},
]

describe('tecnologias de um repositório', () => {
	test('usa topics, dependências e linguagens conhecidas, ignorando o resto', () => {
		expect(repoTechnologies(placar)).toEqual(['Nuxt.js', 'Supabase', 'TypeScript', 'Vue.js'])
	})

	test('sem detalhes, usa a linguagem principal da listagem', () => {
		expect(repoTechnologies(repo({ languages: null, dependencies: null, language: 'Vue' }))).toEqual(['Vue.js'])
	})

	test('associa às tecnologias da vaga', () => {
		expect(matchingTechnologies(['Nuxt.js', 'Vue.js', 'Supabase'], ['Vue 3', 'Nuxt', 'Angular'])).toEqual(['Vue 3', 'Nuxt'])
	})

	test('coloca as tecnologias da vaga primeiro', () => {
		expect(orderTechnologies(['Supabase', 'TypeScript', 'Vue.js'], ['Vue.js'])).toEqual(['Vue.js', 'Supabase', 'TypeScript'])
	})
})

describe('ranqueamento', () => {
	const jobSkills = ['Vue.js', 'Nuxt', 'TypeScript', 'Pinia']

	test('pontua tecnologias da vaga (+10, linguagens básicas +3), descrição (+3) e topics (+3)', () => {
		const ranked = rankProjects(texProjects, [calculadora, chat, placar], jobSkills)
		const byName = Object.fromEntries(ranked.map(candidate => [candidate.project.name, candidate.score]))

		// Placar: Vue e Nuxt (+10 cada), TypeScript (+3), descrição e topics
		expect(byName.Placar).toBe(29)
		// Chat: Vue e Pinia = 20 + descrição
		expect(byName['Chat Vue']).toBe(23)
		// Calculadora: só TypeScript (+3), sem descrição nem topics
		expect(byName['React Calculator']).toBe(3)
		expect(ranked[0]?.project.name).toBe('Placar')
	})

	test('linguagens básicas valem menos; JavaScript e TypeScript contam como uma', () => {
		expect(scoreTechMatches(['Vue.js', 'Nuxt'])).toBe(20)
		expect(scoreTechMatches(['JavaScript', 'TypeScript', 'HTML5', 'CSS3'])).toBe(9)
		expect(scoreTechMatches(['CSS3/SCSS', 'JavaScript ES6+'])).toBe(6)
	})

	test('no empate, ganha o projeto com mais tecnologias', () => {
		const simples = repo({ name: 'simples', fullName: 'fulano/simples', description: 'x', topics: ['vue'], languages: ['Vue'] })
		const completo = repo({
			name: 'completo',
			fullName: 'fulano/completo',
			description: 'x',
			topics: ['vue'],
			languages: ['Vue'],
			dependencies: ['pinia', 'supabase', 'vitest'],
			pushedAt: '2020-01-01T00:00:00Z',
		})
		expect(rankProjects([], [simples, completo], ['Vue.js']).map(candidate => candidate.repo?.name)).toEqual(['completo', 'simples'])
	})

	test('escolhe os melhores com tecnologia da vaga e completa com os do .tex', () => {
		const ranked = rankProjects(texProjects, [placar, chat], ['Supabase'])
		expect(selectProjects(ranked, 2).map(candidate => candidate.project.name)).toEqual(['Placar', 'Loja Exemplo'])
	})

	test('projeto do .tex que também está no GitHub conta uma vez só e mantém o texto do .tex', () => {
		const loja = repo({ name: 'loja', fullName: 'fulano/loja', languages: ['TypeScript'] })
		const ranked = rankProjects(texProjects, [loja], ['TypeScript'])

		expect(ranked).toHaveLength(1)
		expect(ranked[0]).toMatchObject({ fromTex: true, matches: ['TypeScript'] })
		expect(ranked[0]?.project.description).toBe('E-commerce.')
	})
})
