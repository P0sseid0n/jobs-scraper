import { computed, reactive, ref, watch } from 'vue'

import type { JobFacets, WebJob } from '../../api-types'
import { api, type JobFilters } from '../api'
import { DEFAULT_FILTERS, hasActiveFilters, matchesFilters } from '../lib/job-filters'
import { onLive } from './live'
import { arrivedLive } from './seen'

/**
 * Estado da lista de vagas, fora do componente: voltar do detalhe (no celular) mantém filtros, páginas carregadas
 * e a posição.
 */
export const filters = reactive<JobFilters>(structuredClone(DEFAULT_FILTERS))

export const jobs = ref<WebJob[]>([])
export const nextCursor = ref<string | null>(null)
export const status = ref<'loading' | 'ready' | 'error'>('loading')
export const loadingMore = ref(false)
export const error = ref<string | null>(null)
export const facets = ref<JobFacets | null>(null)

/** Vagas que chegaram em tempo real e esperam o clique em "N vagas novas" (a lista não muda sob o cursor). */
export const incoming = ref<WebJob[]>([])

export const filtersActive = computed(() => hasActiveFilters(filters))

let requestId = 0
let started = false

export async function loadJobs() {
	const id = ++requestId
	status.value = 'loading'
	error.value = null

	try {
		const page = await api.jobs(filters)
		if (id !== requestId) return

		jobs.value = page.jobs
		nextCursor.value = page.nextCursor
		incoming.value = []
		status.value = 'ready'
	} catch (cause) {
		if (id !== requestId) return
		error.value = (cause as Error).message
		status.value = 'error'
	}
}

export async function loadMoreJobs() {
	if (!nextCursor.value || loadingMore.value || status.value !== 'ready') return

	const id = requestId
	loadingMore.value = true
	try {
		const page = await api.jobs(filters, nextCursor.value)
		if (id !== requestId) return

		const known = new Set(jobs.value.map(job => job.postId))
		jobs.value = [...jobs.value, ...page.jobs.filter(job => !known.has(job.postId))]
		nextCursor.value = page.nextCursor
	} catch (cause) {
		error.value = (cause as Error).message
	} finally {
		loadingMore.value = false
	}
}

export async function loadFacets() {
	try {
		facets.value = await api.facets()
	} catch {
		// os filtros funcionam sem as contagens
	}
}

export function showIncoming() {
	const fresh = incoming.value.filter(job => !jobs.value.some(existing => existing.postId === job.postId))
	jobs.value = [...fresh, ...jobs.value]
	incoming.value = []
}

export function clearFilters() {
	Object.assign(filters, structuredClone(DEFAULT_FILTERS))
}

/** Carrega a primeira página e passa a acompanhar filtros e vagas novas (uma vez só, na primeira visita à lista). */
export function startJobs() {
	if (started) return
	started = true

	void loadJobs()
	void loadFacets()

	let timer: ReturnType<typeof setTimeout> | undefined
	watch(
		() => JSON.stringify(filters),
		() => {
			clearTimeout(timer)
			timer = setTimeout(loadJobs, 250)
		},
	)

	onLive('job', job => {
		arrivedLive.add(job.postId)
		if (!matchesFilters(job, filters) || jobs.value.some(existing => existing.postId === job.postId)) return

		// Lista vazia: não há o que reordenar sob o cursor, entra direto
		if (jobs.value.length === 0 && status.value === 'ready') jobs.value = [job]
		else if (!incoming.value.some(existing => existing.postId === job.postId)) incoming.value = [job, ...incoming.value]

		void loadFacets()
	})
}
