import type { StreamEvents } from '../api-types'

const HEARTBEAT_MS = 20_000
const encoder = new TextEncoder()

/**
 * Repassa eventos para os navegadores conectados por Server-Sent Events. Quem não está conectado no momento perde o
 * evento: a lista de vagas e os currículos continuam disponíveis pela API.
 */
export class EventHub {
	private readonly clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
	private readonly heartbeat: ReturnType<typeof setInterval>

	constructor() {
		// Comentário SSE: mantém a conexão viva atrás de proxies e detecta clientes que sumiram
		this.heartbeat = setInterval(() => this.write(': ping\n\n'), HEARTBEAT_MS)
	}

	get size() {
		return this.clients.size
	}

	/** Resposta `text/event-stream` que recebe todos os eventos a partir de agora. */
	subscribe(signal?: AbortSignal) {
		let client: ReadableStreamDefaultController<Uint8Array>

		const stream = new ReadableStream<Uint8Array>({
			start: controller => {
				client = controller
				this.clients.add(controller)
				// Reconexão automática do EventSource em 3 s se a conexão cair
				controller.enqueue(encoder.encode('retry: 3000\n\n'))
			},
			cancel: () => {
				this.clients.delete(client)
			},
		})

		signal?.addEventListener('abort', () => this.drop(client))

		return new Response(stream, {
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
		})
	}

	broadcast<E extends keyof StreamEvents>(event: E, data: StreamEvents[E]) {
		this.write(formatEvent(event, data))
	}

	close() {
		clearInterval(this.heartbeat)
		for (const client of this.clients) this.drop(client)
	}

	private write(chunk: string) {
		const bytes = encoder.encode(chunk)

		for (const client of this.clients) {
			try {
				client.enqueue(bytes)
			} catch {
				this.clients.delete(client)
			}
		}
	}

	private drop(client: ReadableStreamDefaultController<Uint8Array>) {
		if (!this.clients.delete(client)) return

		try {
			client.close()
		} catch {
			// já fechado pelo navegador
		}
	}
}

export function formatEvent(event: string, data: unknown) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
