import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { storage } from '../lib/storage'
import { createStore, useStore } from '../lib/store'
import { jobsStore, setViewedAt } from './jobs'
import { onLive } from './live'
import { notify } from './toast'

type ViewedJob = Pick<WebJob, 'postId' | 'viewedAt'>

/**
 * O que mudou em `viewedAt` depois que as vagas foram carregadas (aqui, em outra aba ou em outro aparelho). A vaga
 * aberta por link pode não estar na lista: a mudança fica aqui, não só nela.
 */
const changes = createStore(new Map<string, string | null>())

function apply(postIds: string[], viewedAt: string | null) {
	changes.set(current => {
		const next = new Map(current)
		for (const postId of postIds) next.set(postId, viewedAt)
		return next
	})
	setViewedAt(postIds, viewedAt)
}

onLive('viewed', ({ postIds, viewedAt }) => apply(postIds, viewedAt))

const viewedAtIn = (map: Map<string, string | null>, job: ViewedJob) =>
	map.has(job.postId) ? (map.get(job.postId) ?? null) : job.viewedAt

/** Função que diz se a vaga já foi vista, atualizada a cada marcação. */
export function useViewedCheck() {
	const map = useStore(changes)
	return (job: ViewedJob) => viewedAtIn(map, job) !== null
}

export function useViewed(job: ViewedJob) {
	return useViewedCheck()(job)
}

/** Marca ou desmarca uma vaga na hora; se o servidor recusar, volta como estava e avisa. */
export async function setViewed(job: ViewedJob, viewed: boolean) {
	const previous = viewedAtIn(changes.get(), job)
	apply([job.postId], viewed ? (previous ?? new Date().toISOString()) : null)

	try {
		const saved = await api.setViewed(job.postId, viewed)
		apply([job.postId], saved.viewedAt)
	} catch (error) {
		apply([job.postId], previous)
		notify(error instanceof RequestError ? error.message : 'Não consegui marcar a vaga', 'error')
	}
}

/** Ao abrir o detalhe: marca como vista, se ainda não estiver (o servidor mantém a data de quando foi vista antes). */
export function markViewed(postId: string) {
	// Fora da lista (aberta por link) e sem mudança conhecida, pede ao servidor: marcar de novo não muda nada
	const job = { postId, viewedAt: jobsStore.get().jobs.find(item => item.postId === postId)?.viewedAt ?? null }
	if (viewedAtIn(changes.get(), job) !== null) return

	void setViewed(job, true)
}

/** "Marcar todas como vistas": as vagas não vistas que estão na tela. */
export async function markAllViewed(jobs: ViewedJob[]) {
	const pending = jobs.filter(job => viewedAtIn(changes.get(), job) === null).map(job => job.postId)
	if (pending.length === 0) return

	try {
		const change = await api.setJobsViewed(pending, true)
		if (change.postIds.length > 0) apply(change.postIds, change.viewedAt)
	} catch (error) {
		notify(error instanceof RequestError ? error.message : 'Não consegui marcar as vagas', 'error')
	}
}

/** Chaves de quando a marcação ficava só neste navegador. */
const LEGACY_SEEN_KEY = 'jobs:seen'
const LEGACY_LAST_VISIT_KEY = 'jobs:last-visit'

/**
 * Leva para o servidor, uma vez, as vagas abertas neste navegador quando a marcação ficava no `localStorage`, e apaga
 * as chaves antigas. Se falhar, tenta de novo na próxima visita.
 */
export async function importLocalSeen() {
	const seen = storage.get<unknown>(LEGACY_SEEN_KEY, [])
	const postIds = Array.isArray(seen) ? seen.filter((id): id is string => typeof id === 'string' && id.length > 0) : []

	if (postIds.length > 0) {
		try {
			const change = await api.setJobsViewed(postIds.slice(-2_000), true)
			if (change.postIds.length > 0) apply(change.postIds, change.viewedAt)
		} catch {
			return
		}
	}

	storage.remove(LEGACY_SEEN_KEY)
	storage.remove(LEGACY_LAST_VISIT_KEY)
}
