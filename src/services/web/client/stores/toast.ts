import { ref } from 'vue'

export type Toast = { id: number; message: string; tone: 'info' | 'error' }

export const toasts = ref<Toast[]>([])
let nextId = 1

/** Aviso curto no canto da tela (some sozinho). */
export function notify(message: string, tone: Toast['tone'] = 'info') {
	const id = nextId++
	toasts.value = [...toasts.value, { id, message, tone }]
	setTimeout(() => dismissToast(id), tone === 'error' ? 8_000 : 3_500)
}

export function dismissToast(id: number) {
	toasts.value = toasts.value.filter(toast => toast.id !== id)
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
