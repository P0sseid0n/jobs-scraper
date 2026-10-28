import { useEffect, useState } from 'react'

import type { WebAppliedSimilar, WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { createStore, useStore } from '../lib/store'
import { setAppliedAt } from './jobs'
import { onLive } from './live'
import { notify, type ToastAction } from './toast'

type AppliedJob = Pick<WebJob, 'postId' | 'appliedAt'>

/**
 * O que mudou em `appliedAt` depois que as vagas foram carregadas (aqui, em outra aba, em outro aparelho ou no Discord).
 * A vaga aberta por link pode não estar na lista: a mudança fica aqui, não só nela.
 */
const changes = createStore(new Map<string, string | null>())

function apply(postId: string, appliedAt: string | null) {
	changes.set(current => new Map(current).set(postId, appliedAt))
	setAppliedAt(postId, appliedAt)
}

onLive('applied', ({ postId, appliedAt }) => apply(postId, appliedAt))

const appliedAtIn = (map: Map<string, string | null>, job: AppliedJob) =>
	map.has(job.postId) ? (map.get(job.postId) ?? null) : job.appliedAt

/** Quando a pessoa marcou que se candidatou à vaga (`null`: não marcou), atualizado a cada marcação. */
export function useAppliedAt(job: AppliedJob) {
	return appliedAtIn(useStore(changes), job)
}

/** Marca ou desmarca a candidatura na hora; se o servidor recusar, volta como estava e avisa. */
export async function setApplied(job: AppliedJob, applied: boolean) {
	const previous = appliedAtIn(changes.get(), job)
	apply(job.postId, applied ? (previous ?? new Date().toISOString()) : null)

	try {
		const saved = await api.setApplied(job.postId, applied)
		apply(job.postId, saved.appliedAt)
	} catch (error) {
		apply(job.postId, previous)
		notify(error instanceof RequestError ? error.message : 'Não consegui marcar a candidatura', 'error')
	}
}

/**
 * O botão "marcar como enviada" para o aviso de quem acabou de copiar a mensagem ou abrir a candidatura: copiar não
 * quer dizer que enviou, então só lembra. `undefined` na vaga já marcada.
 */
export function appliedSuggestion(job: AppliedJob): ToastAction | undefined {
	if (appliedAtIn(changes.get(), job) !== null) return undefined

	return { label: 'marcar como enviada', run: () => void setApplied(job, true) }
}

/**
 * Outra vaga que parece a mesma desta (a mesma empresa e cargo, ou o mesmo link) em que a pessoa já se candidatou, para
 * não se candidatar duas vezes. Busca de novo a cada candidatura marcada ou desmarcada.
 */
export function useAppliedSimilar(postId: string) {
	const revision = useStore(changes)
	const [similar, setSimilar] = useState<WebAppliedSimilar | null>(null)

	useEffect(() => {
		let active = true
		api.appliedSimilar(postId).then(
			found => active && setSimilar(found),
			// Sem o aviso a vaga funciona igual
			() => active && setSimilar(null),
		)
		return () => {
			active = false
		}
	}, [postId, revision])

	return similar
}
