import { ref } from 'vue'

import type { StreamEvents } from '../../api-types'

type Listener<E extends keyof StreamEvents> = (data: StreamEvents[E]) => void

const listeners: { [E in keyof StreamEvents]: Set<Listener<E>> } = { job: new Set(), cv: new Set() }

/** Se o navegador está recebendo as vagas novas em tempo real. */
export const connected = ref(false)

/** Abre o stream SSE (uma conexão para a aplicação inteira); o EventSource reconecta sozinho se cair. */
export function connectLive() {
	const source = new EventSource('/api/jobs/stream')

	source.addEventListener('open', () => (connected.value = true))
	source.addEventListener('error', () => (connected.value = false))

	for (const event of Object.keys(listeners) as (keyof StreamEvents)[]) {
		source.addEventListener(event, message => {
			const data = JSON.parse((message as MessageEvent<string>).data) as StreamEvents[typeof event]
			for (const listener of listeners[event]) (listener as Listener<typeof event>)(data)
		})
	}
}

/** Escuta um evento do stream; devolve a função que para de escutar. */
export function onLive<E extends keyof StreamEvents>(event: E, listener: Listener<E>) {
	listeners[event].add(listener)

	return () => listeners[event].delete(listener)
}
