import { reactive } from 'vue'

import type { WebJob } from '../../api-types'
import { storage } from '../lib/storage'

const LAST_VISIT_KEY = 'jobs:last-visit'
const SEEN_KEY = 'jobs:seen'
const MAX_SEEN = 2_000

/** Vagas que entraram depois da visita anterior contam como novas até serem abertas. */
const previousVisit = storage.get<string | null>(LAST_VISIT_KEY, null)
storage.set(LAST_VISIT_KEY, new Date().toISOString())

const seen = reactive(new Set(storage.get<string[]>(SEEN_KEY, [])))

/** Vagas que chegaram pelo stream com a tela aberta: são novas mesmo na primeira visita. */
export const arrivedLive = reactive(new Set<string>())

export function isUnseen(job: Pick<WebJob, 'postId' | 'createdAt'>) {
	if (seen.has(job.postId)) return false
	if (arrivedLive.has(job.postId)) return true

	// Primeira visita: nada é marcado (senão o histórico inteiro viria como novo)
	return previousVisit !== null && job.createdAt > previousVisit
}

export function markSeen(postId: string) {
	if (seen.has(postId)) return

	seen.add(postId)
	arrivedLive.delete(postId)
	storage.set(SEEN_KEY, [...seen].slice(-MAX_SEEN))
}
