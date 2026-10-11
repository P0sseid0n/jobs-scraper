/**
 * Fila de uso do navegador: a coleta e a abertura das vagas de posts com várias nunca acessam o LinkedIn ao
 * mesmo tempo. Cada tarefa espera a anterior terminar, mesmo que ela falhe.
 */
export class BrowserLock {
	private tail: Promise<unknown> = Promise.resolve()

	run<T>(task: () => Promise<T>): Promise<T> {
		const result = this.tail.then(task)
		this.tail = result.catch(() => {})

		return result
	}
}
