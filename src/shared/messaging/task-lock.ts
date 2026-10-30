type Waiting = { start: () => void; priority: boolean }

/**
 * Fila de uso de um recurso que só atende uma tarefa por vez (o navegador do scraper, o modelo do post-processing).
 * Cada tarefa espera a anterior terminar, mesmo que ela falhe, na ordem em que chegou; a de `priority` (o "processar de
 * novo" pedido pelo site, com alguém esperando a resposta) passa à frente das comuns que ainda esperam, mas não
 * interrompe a que está rodando.
 */
export class TaskLock {
	private busy = false
	private readonly waiting: Waiting[] = []

	async run<T>(task: () => Promise<T>, { priority = false } = {}): Promise<T> {
		if (this.busy) await new Promise<void>(start => this.enqueue({ start, priority }))
		this.busy = true

		try {
			return await task()
		} finally {
			// A vez passa direto para a próxima: `busy` só volta a `false` sem ninguém esperando
			const next = this.waiting.shift()
			if (next) next.start()
			else this.busy = false
		}
	}

	/** Atrás das outras de prioridade e à frente das comuns (se `priority`), ou no fim. */
	private enqueue(waiting: Waiting) {
		const index = waiting.priority ? this.waiting.findIndex(other => !other.priority) : -1
		if (index < 0) this.waiting.push(waiting)
		else this.waiting.splice(index, 0, waiting)
	}
}
