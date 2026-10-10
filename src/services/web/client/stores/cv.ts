import { computed, reactive, ref } from 'vue'

import type { WebCvRequest, WebJob } from '../../api-types'
import { api } from '../api'
import { connected, onLive } from './live'

/** Pedidos de currículo conhecidos, por `requestId` (os da API e os que chegam pelo stream). */
const requests = reactive(new Map<string, WebCvRequest>())

/** Pedidos feitos ou acompanhados nesta sessão: aparecem no indicador global até serem dispensados. */
const tracked = reactive(new Set<string>())

export const cvError = ref<string | null>(null)
export const cvLoaded = ref(false)

export const allCvRequests = computed(() => [...requests.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)))

export const trayRequests = computed(() => allCvRequests.value.filter(request => tracked.has(request.requestId)))

/** O pedido mais recente de cada vaga. */
const latestByPost = computed(() => {
	const latest = new Map<string, WebCvRequest>()
	for (const request of allCvRequests.value) if (!latest.has(request.postId)) latest.set(request.postId, request)
	return latest
})

export function cvFor(postId: string) {
	return latestByPost.value.get(postId) ?? null
}

function upsert(request: WebCvRequest) {
	requests.set(request.requestId, request)
}

onLive('cv', request => {
	// Pedido feito em outra aba também aparece no indicador
	if (request.status === 'pending') tracked.add(request.requestId)
	upsert(request)
})

export async function loadCvRequests() {
	try {
		for (const request of await api.cvRequests()) upsert(request)
		cvError.value = null
	} catch (error) {
		cvError.value = (error as Error).message
	} finally {
		cvLoaded.value = true
	}
}

/** Pede o currículo da vaga (ou devolve o pedido em andamento) e acompanha no indicador global. */
export async function requestCv(job: Pick<WebJob, 'postId'>) {
	const request = await api.requestCv(job.postId)
	upsert(request)
	tracked.add(request.requestId)

	return request
}

export function dismissCv(requestId: string) {
	tracked.delete(requestId)
}

// Sem o stream (conexão caiu), consulta os pedidos pendentes a cada 10 s
setInterval(async () => {
	if (connected.value) return

	const pending = allCvRequests.value.filter(request => request.status === 'pending')
	for (const request of pending) {
		try {
			upsert(await api.cvRequest(request.requestId))
		} catch {
			// tenta de novo na próxima volta
		}
	}
}, 10_000)
