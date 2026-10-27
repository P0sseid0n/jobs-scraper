import type { JobFacets, WebJob } from '../../api-types'
import { isJobRouteId } from '../../job-route-id'
import { api, type JobFilters } from '../api'
import { DEFAULT_FILTERS, matchesFilters } from '../lib/job-filters'
import { createStore, useStore } from '../lib/store'
import { onLive } from './live'

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
let loaded = false
let following = false
let filtersTimer: ReturnType<typeof setTimeout> | undefined
let facetsTimer: ReturnType<typeof setTimeout> | undefined

/** @param until O id da vaga aberta na URL: a primeira página vem do topo até ela (ver `listJobs` no servidor). */
export async function loadJobs(until?: string) {
	const id = ++requestId
	update({ status: 'loading', error: null })

	try {
		const page = await api.jobs(jobsStore.get().filters, null, until)
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
	update({ loadingMore: true, error: null })
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

/**
 * Atualiza quando as vagas foram vistas na lista (e nas que esperam para entrar), sem tirá-las da tela mesmo com o
 * filtro "só não vistas": a vaga aberta não some debaixo do cursor.
 */
export function setViewedAt(postIds: string[], viewedAt: string | null) {
	const { jobs, incoming } = jobsStore.get()
	const ids = new Set(postIds)
	const patch = (list: WebJob[]) => list.map(job => (ids.has(job.postId) && job.viewedAt !== viewedAt ? { ...job, viewedAt } : job))

	update({ jobs: patch(jobs), incoming: patch(incoming) })
	// A mesma marcação chega pela resposta e pelo stream: uma recontagem só
	clearTimeout(facetsTimer)
	facetsTimer = setTimeout(loadFacets, 300)
}

/** Tira da lista a vaga marcada como "não é vaga" (o documento continua no banco). */
export function removeJob(postId: string) {
	const { jobs, incoming } = jobsStore.get()

	update({ jobs: jobs.filter(job => job.postId !== postId), incoming: incoming.filter(job => job.postId !== postId) })
	void loadFacets()
}

/** Muda os filtros; a lista recarrega 250 ms depois da última mudança (a busca por texto não recarrega a cada letra). */
function setFilters(filters: JobFilters, until?: string) {
	if (JSON.stringify(filters) === JSON.stringify(jobsStore.get().filters)) return

	update({ filters })
	clearTimeout(filtersTimer)
	filtersTimer = setTimeout(() => loadJobs(until), 250)
}

/**
 * O loader da lista chama a cada mudança nos filtros da URL. Na primeira vez, espera a primeira página: se ela falhar,
 * o erro vai para o `errorComponent` da rota (e a próxima tentativa carrega de novo). Depois, a lista recarrega no lugar,
 * com os filtros na tela.
 * @param until O id da vaga, quando se chega à lista por `/vagas/$id`: a lista vem até ela, para mostrá-la.
 */
export async function loadJobsFor(filters: JobFilters, until?: string) {
	if (loaded) {
		const { jobs, status, filters: current } = jobsStore.get()
		if (JSON.stringify(filters) !== JSON.stringify(current)) return setFilters(filters, until)
		// Vindo de outra tela para uma vaga que a lista carregada não tem: recarrega até ela
		if (until && status === 'ready' && !jobs.some(job => isJobRouteId(job.postId, until))) void loadJobs(until)
		return
	}

	update({ filters })
	await loadJobs(until)
	const { status, error } = jobsStore.get()
	if (status === 'error') throw new Error(error ?? 'Não consegui carregar as vagas')

	loaded = true
	void loadFacets()
	followLive()
}

/** Passa a acompanhar as vagas novas em tempo real (uma vez só). */
function followLive() {
	if (following) return
	following = true

	onLive('job', job => {
		const { jobs, incoming, status, filters } = jobsStore.get()
		if (!matchesFilters(job, filters) || jobs.some(existing => existing.postId === job.postId)) return

		// Lista vazia: não há o que reordenar sob o cursor, entra direto
		if (jobs.length === 0 && status === 'ready') update({ jobs: [job] })
		else if (!incoming.some(existing => existing.postId === job.postId)) update({ incoming: [job, ...incoming] })

		void loadFacets()
	})
}
