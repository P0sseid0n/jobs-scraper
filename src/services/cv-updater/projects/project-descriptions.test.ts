import { describe, expect, test } from 'bun:test'

import type { ResumeProject } from '../resume/resume.types'
import type { GithubRepo } from './github-repositories'
import { applyDescriptions, buildDescriptionRequest } from './project-descriptions'
import { rankProjects } from './project-ranking'

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

const texProjects: ResumeProject[] = [
	{
		name: 'Loja Exemplo',
		url: 'github.com/fulano/loja',
		description: 'E-commerce.',
		technologies: ['React', 'Node.js', 'PostgreSQL'],
	},
]

describe('descrição dos projetos novos', () => {
	const ranked = rankProjects(texProjects, [placar], ['Vue.js'])

	test('pede descrição só para os projetos que não estão no .tex', () => {
		expect(buildDescriptionRequest(ranked, 'Exemplo').names).toEqual(['Placar'])
	})

	test('usa a descrição gerada se tiver tamanho razoável; senão, a do GitHub', () => {
		const good = 'Aplicação de placar em tempo real com salas compartilhadas e atualização instantânea entre dispositivos.'
		expect(applyDescriptions(ranked, [{ repo: 'Placar', description: good }])[0]?.description).toBe(good)
		expect(applyDescriptions(ranked, [{ repo: 'Placar', description: 'curta' }])[0]?.description).toBe('Placar em tempo real')
	})
})
