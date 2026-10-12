import type { WebJob } from '../../api-types'
import { storage } from '../lib/storage'
import { createStore, useStore } from '../lib/store'

const LAST_VISIT_KEY = 'jobs:last-visit'
const SEEN_KEY = 'jobs:seen'
const MAX_SEEN = 2_000

/** Vagas que entraram depois da visita anterior contam como novas até serem abertas. */
const previousVisit = storage.get<string | null>(LAST_VISIT_KEY, null)
storage.set(LAST_VISIT_KEY, new Date().toISOString())

const state = createStore({
	seen: new Set(storage.get<string[]>(SEEN_KEY, [])),
	/** Vagas que chegaram pelo stream com a tela aberta: são novas mesmo na primeira visita. */
	arrivedLive: new Set<string>(),
})

/** Se a vaga conta como nova, atualizado quando ela é aberta ou chega pelo stream. */
export function useUnseen(job: Pick<WebJob, 'postId' | 'createdAt'>) {
	const { seen, arrivedLive } = useStore(state)

	if (seen.has(job.postId)) return false
	if (arrivedLive.has(job.postId)) return true

	// Primeira visita: nada é marcado (senão o histórico inteiro viria como novo)
	return previousVisit !== null && job.createdAt > previousVisit
}

export function markArrived(postId: string) {
	state.set(current => ({ ...current, arrivedLive: new Set(current.arrivedLive).add(postId) }))
}

export function markSeen(postId: string) {
	const current = state.get()
	if (current.seen.has(postId)) return

	const seen = new Set(current.seen).add(postId)
	const arrivedLive = new Set(current.arrivedLive)
	arrivedLive.delete(postId)

	state.set({ seen, arrivedLive })
	storage.set(SEEN_KEY, [...seen].slice(-MAX_SEEN))
}
