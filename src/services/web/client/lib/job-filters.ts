import { z } from 'zod'

import { CONTRACT_TYPES, WORK_MODES } from '@shared/contracts'

import type { WebJob } from '../../api-types'

/**
 * Os filtros da lista de vagas como parâmetros da URL (`/?workMode=["remoto"]&since="7d"`). Valor ausente ou inválido
 * (link antigo, URL editada à mão) vira o padrão, em vez de dar erro; os padrões não aparecem na URL.
 */
export const jobFiltersSearch = z.object({
	q: z.string().default('').catch(''),
	workMode: z
		.array(z.enum([...WORK_MODES, 'none']))
		.default([])
		.catch([]),
	contractType: z
		.array(z.enum([...CONTRACT_TYPES, 'none']))
		.default([])
		.catch([]),
	skills: z.array(z.string()).default([]).catch([]),
	since: z.enum(['all', '24h', '7d', '30d']).default('all').catch('all'),
	hasEmail: z.boolean().default(false).catch(false),
	/** Só as vagas ainda não abertas no site. */
	unviewed: z.boolean().default(false).catch(false),
	language: z.string().default('').catch(''),
	minConfidence: z.number().int().min(0).max(100).default(0).catch(0),
})

/** Os filtros da lista de vagas (o mesmo formato da URL e da API). */
export type JobFilters = z.output<typeof jobFiltersSearch>

/** Sem nenhum filtro: o que a URL sem parâmetros representa. */
export const DEFAULT_FILTERS: JobFilters = jobFiltersSearch.parse({})

export function hasActiveFilters(filters: JobFilters) {
	return (Object.keys(DEFAULT_FILTERS) as (keyof JobFilters)[]).some(
		key => JSON.stringify(filters[key]) !== JSON.stringify(DEFAULT_FILTERS[key]),
	)
}

const SINCE_MS = { '24h': 1, '7d': 7, '30d': 30 } as const

/**
 * Mesmo critério do servidor, para decidir no navegador se uma vaga que chegou em tempo real entra na lista
 * filtrada que está na tela.
 */
export function matchesFilters(job: WebJob, filters: JobFilters, now = Date.now()) {
	const skills = (job.necessaryKnowledge ?? []).map(skill => skill.toLowerCase())
	const q = filters.q.trim().toLowerCase()

	if (q && ![job.title, job.company ?? '', job.rawContent, ...skills].some(text => text.toLowerCase().includes(q))) return false
	if (filters.workMode.length && !filters.workMode.includes(job.workMode ?? 'none')) return false
	if (filters.contractType.length && !(job.contractTypes ?? ['none']).some(type => filters.contractType.includes(type))) return false
	if (!filters.skills.every(skill => skills.includes(skill.toLowerCase()))) return false
	if (filters.since !== 'all' && new Date(job.createdAt).getTime() < now - SINCE_MS[filters.since] * 24 * 60 * 60 * 1000) return false
	if (filters.hasEmail && !job.recruiterEmail) return false
	if (filters.unviewed && job.viewedAt) return false
	if (filters.language && job.language !== filters.language) return false
	if (job.aiJobConfidence < filters.minConfidence) return false

	return true
}
