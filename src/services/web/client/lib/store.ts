import { useSyncExternalStore } from 'react'

/** Estado global fora dos componentes: um valor imutável que avisa quem escuta a cada troca. */
export type Store<T> = {
	get(): T
	set(next: T | ((current: T) => T)): void
	subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
	let value = initial
	const listeners = new Set<() => void>()

	return {
		get: () => value,
		set(next) {
			const resolved = typeof next === 'function' ? (next as (current: T) => T)(value) : next
			if (Object.is(resolved, value)) return

			value = resolved
			for (const listener of listeners) listener()
		},
		subscribe(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

/** Lê o store no componente e renderiza de novo quando ele muda. */
export function useStore<T>(store: Store<T>): T {
	return useSyncExternalStore(store.subscribe, store.get)
}
