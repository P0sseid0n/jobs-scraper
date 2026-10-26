import { createStore, useStore } from '../lib/store'

/** `duration`: quanto o aviso fica na tela (ms); o tempo para com o mouse em cima (`Toasts`). */
export type Toast = { id: number; message: string; tone: 'info' | 'error'; duration: number }

export const toasts = createStore<Toast[]>([])
let nextId = 1

export function useToasts() {
	return useStore(toasts)
}

/** Aviso curto no canto da tela (some sozinho, quando a barra do tempo dele esvazia). */
export function notify(message: string, tone: Toast['tone'] = 'info') {
	const id = nextId++
	toasts.set(current => [...current, { id, message, tone, duration: tone === 'error' ? 8_000 : 3_500 }])
}

export function dismissToast(id: number) {
	toasts.set(current => current.filter(toast => toast.id !== id))
}

/** Copia para a área de transferência avisando o resultado. */
export async function copyText(text: string, what: string) {
	try {
		await navigator.clipboard.writeText(text)
		notify(`${what} copiado`)
		return true
	} catch {
		notify(`Não consegui copiar ${what.toLowerCase()}; selecione e copie manualmente`, 'error')
		return false
	}
}
