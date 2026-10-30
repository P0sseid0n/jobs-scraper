import { shakeFailedAction } from '../lib/motion'
import { createStore, useStore } from '../lib/store'

/** Um botão no aviso (ex.: "marcar como enviada"); o aviso fecha ao clicar. */
export type ToastAction = { label: string; run: () => void }

/**
 * `duration`: quanto o aviso fica na tela (ms); o tempo para com o mouse em cima (`Toasts`). `shake`: o aviso de erro
 * treme ao chegar, quando não há o botão da ação que falhou para tremer.
 */
export type Toast = {
	id: number
	message: string
	tone: 'info' | 'error'
	duration: number
	action?: ToastAction
	shake?: boolean
}

export const toasts = createStore<Toast[]>([])
let nextId = 1

export function useToasts() {
	return useStore(toasts)
}

/**
 * Aviso curto no canto da tela (some sozinho, quando a barra do tempo dele esvazia). Com `action`, fica mais tempo, para
 * dar tempo de ler e clicar. O erro treme o botão que pediu a ação (ou, sem ele na tela, o próprio aviso).
 */
export function notify(message: string, tone: Toast['tone'] = 'info', action?: ToastAction) {
	const id = nextId++
	const duration = tone === 'error' ? 8_000 : action ? 7_000 : 3_500
	const shake = tone === 'error' && !shakeFailedAction()
	toasts.set(current => [...current, { id, message, tone, duration, action, shake }])
}

export function dismissToast(id: number) {
	toasts.set(current => current.filter(toast => toast.id !== id))
}

/** Copia para a área de transferência avisando o resultado; `action` vai no aviso de que copiou. */
export async function copyText(text: string, what: string, action?: ToastAction) {
	try {
		await navigator.clipboard.writeText(text)
		notify(`${what} copiado`, 'info', action)
		return true
	} catch {
		notify(`Não consegui copiar ${what.toLowerCase()}; selecione e copie manualmente`, 'error')
		return false
	}
}
