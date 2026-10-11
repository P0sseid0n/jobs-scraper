import { useMemo } from 'react'

import type { WebCvRequest, WebJob } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'
import { connected, onLive } from './live'

const state = createStore({
	/** Pedidos de currículo conhecidos, por `requestId` (os da API e os que chegam pelo stream). */
	requests: new Map<string, WebCvRequest>(),
	/** Pedidos feitos ou acompanhados nesta sessão: aparecem no indicador global até serem dispensados. */
	tracked: new Set<string>(),
	error: null as string | null,
	loaded: false,
})

function sorted(requests: Map<string, WebCvRequest>) {
	return [...requests.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
}

/** Todos os pedidos, do mais recente ao mais antigo, e o estado da carga inicial. */
export function useCvRequests() {
	const { requests, error, loaded } = useStore(state)
	const all = useMemo(() => sorted(requests), [requests])

	return { requests: all, error, loaded }
}

/** Os pedidos do indicador global. */
export function useTrayRequests() {
	const { requests, tracked } = useStore(state)

	return useMemo(() => sorted(requests).filter(request => tracked.has(request.requestId)), [requests, tracked])
}

/** O pedido mais recente da vaga. */
export function useCvFor(postId: string) {
	const { requests } = useStore(state)

	return useMemo(() => {
		let latest: WebCvRequest | null = null
		for (const request of requests.values()) {
			if (request.postId === postId && (!latest || request.requestedAt > latest.requestedAt)) latest = request
		}
		return latest
	}, [requests, postId])
}

/** A mensagem de candidatura gerada pela IA mais recente da vaga (um pedido novo em andamento não a apaga). */
export function useGeneratedMessage(postId: string) {
	const { requests } = useStore(state)

	return useMemo(() => {
		let latest: WebCvRequest | null = null
		for (const request of requests.values()) {
			if (request.postId !== postId || request.status !== 'ready' || !request.message) continue
			if (!latest || request.requestedAt > latest.requestedAt) latest = request
		}
		return latest?.message ?? null
	}, [requests, postId])
}

function upsert(request: WebCvRequest, { track = false } = {}) {
	state.set(current => ({
		...current,
		requests: new Map(current.requests).set(request.requestId, request),
		tracked: track ? new Set(current.tracked).add(request.requestId) : current.tracked,
	}))
}

// Pedido feito em outra aba também aparece no indicador
onLive('cv', request => upsert(request, { track: request.status === 'pending' }))

export async function loadCvRequests() {
	try {
		const requests = await api.cvRequests()
		state.set(current => {
			const next = new Map(current.requests)
			for (const request of requests) next.set(request.requestId, request)
			return { ...current, requests: next, error: null }
		})
	} catch (error) {
		state.set(current => ({ ...current, error: (error as Error).message }))
	} finally {
		state.set(current => (current.loaded ? current : { ...current, loaded: true }))
	}
}

/** Pede o currículo da vaga (ou devolve o pedido em andamento) e acompanha no indicador global. */
export async function requestCv(job: Pick<WebJob, 'postId'>) {
	const request = await api.requestCv(job.postId)
	upsert(request, { track: true })

	return request
}

export function dismissCv(requestId: string) {
	state.set(current => {
		const tracked = new Set(current.tracked)
		tracked.delete(requestId)
		return { ...current, tracked }
	})
}

// Sem o stream (conexão caiu), consulta os pedidos pendentes a cada 10 s
setInterval(async () => {
	if (connected.get()) return

	const pending = [...state.get().requests.values()].filter(request => request.status === 'pending')
	for (const request of pending) {
		try {
			upsert(await api.cvRequest(request.requestId))
		} catch {
			// tenta de novo na próxima volta
		}
	}
}, 10_000)
