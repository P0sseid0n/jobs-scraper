import type { WebJob } from '../../api-types'
import type { JobFilters } from '../api'

export const DEFAULT_FILTERS: JobFilters = {
	q: '',
	workMode: [],
	skills: [],
	since: 'all',
	hasEmail: false,
	language: '',
	minConfidence: 0,
}

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
	const skills = (job.necessary_knowledge ?? []).map(skill => skill.toLowerCase())
	const q = filters.q.trim().toLowerCase()

	if (q && ![job.title, job.company ?? '', job.rawContent, ...skills].some(text => text.toLowerCase().includes(q))) return false
	if (filters.workMode.length && !filters.workMode.includes(job.workMode ?? 'none')) return false
	if (!filters.skills.every(skill => skills.includes(skill.toLowerCase()))) return false
	if (filters.since !== 'all' && new Date(job.createdAt).getTime() < now - SINCE_MS[filters.since] * 24 * 60 * 60 * 1000) return false
	if (filters.hasEmail && !job.recruiter_email) return false
	if (filters.language && job.language !== filters.language) return false
	if (job.aiJobConfidence < filters.minConfidence) return false

	return true
}
