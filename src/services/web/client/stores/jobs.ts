import type { JobFacets, WebJob } from '../../api-types'
import { api, type JobFilters } from '../api'
import { DEFAULT_FILTERS, matchesFilters } from '../lib/job-filters'
import { createStore, useStore } from '../lib/store'
import { onLive } from './live'
import { markArrived } from './seen'

type JobsState = {
	filters: JobFilters
	jobs: WebJob[]
	nextCursor: string | null
	status: 'loading' | 'ready' | 'error'
	loadingMore: boolean
	error: string | null
	facets: JobFacets | null
	/** Vagas que chegaram em tempo real e esperam o clique em "N vagas novas" (a lista não muda sob o cursor). */
	incoming: WebJob[]
}

/**
 * Estado da lista de vagas, fora do componente: voltar do detalhe (no celular) mantém filtros, páginas carregadas
 * e a posição.
 */
export const jobsStore = createStore<JobsState>({
	filters: structuredClone(DEFAULT_FILTERS),
	jobs: [],
	nextCursor: null,
	status: 'loading',
	loadingMore: false,
	error: null,
	facets: null,
	incoming: [],
})

export function useJobs() {
	return useStore(jobsStore)
}

const update = (patch: Partial<JobsState>) => jobsStore.set(current => ({ ...current, ...patch }))

let requestId = 0
let started = false
let filtersTimer: ReturnType<typeof setTimeout> | undefined

export async function loadJobs() {
	const id = ++requestId
	update({ status: 'loading', error: null })

	try {
		const page = await api.jobs(jobsStore.get().filters)
		if (id !== requestId) return

		update({ jobs: page.jobs, nextCursor: page.nextCursor, incoming: [], status: 'ready' })
	} catch (cause) {
		if (id !== requestId) return
		update({ error: (cause as Error).message, status: 'error' })
	}
}

export async function loadMoreJobs() {
	const { nextCursor, loadingMore, status, filters } = jobsStore.get()
	if (!nextCursor || loadingMore || status !== 'ready') return

	const id = requestId
	update({ loadingMore: true })
	try {
		const page = await api.jobs(filters, nextCursor)
		if (id !== requestId) return

		const { jobs } = jobsStore.get()
		const known = new Set(jobs.map(job => job.postId))
		update({ jobs: [...jobs, ...page.jobs.filter(job => !known.has(job.postId))], nextCursor: page.nextCursor })
	} catch (cause) {
		update({ error: (cause as Error).message })
	} finally {
		update({ loadingMore: false })
	}
}

export async function loadFacets() {
	try {
		update({ facets: await api.facets() })
	} catch {
		// os filtros funcionam sem as contagens
	}
}

export function showIncoming() {
	const { jobs, incoming } = jobsStore.get()
	const fresh = incoming.filter(job => !jobs.some(existing => existing.postId === job.postId))
	update({ jobs: [...fresh, ...jobs], incoming: [] })
}

/** Troca a vaga corrigida pelo site na lista (e nas que esperam para entrar), mantendo a posição. */
export function replaceJob(job: WebJob) {
	const { jobs, incoming } = jobsStore.get()
	const swap = (list: WebJob[]) => list.map(item => (item.postId === job.postId ? job : item))

	update({ jobs: swap(jobs), incoming: swap(incoming) })
	void loadFacets()
}

/** Tira da lista a vaga marcada como "não é vaga" (o documento continua no banco). */
export function removeJob(postId: string) {
	const { jobs, incoming } = jobsStore.get()

	update({ jobs: jobs.filter(job => job.postId !== postId), incoming: incoming.filter(job => job.postId !== postId) })
	void loadFacets()
}

/** Muda os filtros; a lista recarrega 250 ms depois da última mudança. */
export function setFilters(patch: Partial<JobFilters>) {
	const current = jobsStore.get().filters
	const filters = { ...current, ...patch }
	if (JSON.stringify(filters) === JSON.stringify(current)) return

	update({ filters })
	clearTimeout(filtersTimer)
	filtersTimer = setTimeout(loadJobs, 250)
}

export function clearFilters() {
	setFilters(structuredClone(DEFAULT_FILTERS))
}

/** Carrega a primeira página e passa a acompanhar as vagas novas (uma vez só, na primeira visita à lista). */
export function startJobs() {
	if (started) return
	started = true

	void loadJobs()
	void loadFacets()

	onLive('job', job => {
		markArrived(job.postId)

		const { jobs, incoming, status, filters } = jobsStore.get()
		if (!matchesFilters(job, filters) || jobs.some(existing => existing.postId === job.postId)) return

		// Lista vazia: não há o que reordenar sob o cursor, entra direto
		if (jobs.length === 0 && status === 'ready') update({ jobs: [job] })
		else if (!incoming.some(existing => existing.postId === job.postId)) update({ incoming: [job, ...incoming] })

		void loadFacets()
	})
}
