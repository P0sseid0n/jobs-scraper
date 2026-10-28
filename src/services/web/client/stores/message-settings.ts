import type { WebSettings } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'

type MessageSettingsState = {
	/** As configurações da mensagem de candidatura; `null` até a primeira leitura (ou se ela falhou). */
	value: WebSettings['message'] | null
	/** `loading` também antes da primeira leitura; `failed` até alguém pedir de novo. */
	status: 'loading' | 'ready' | 'failed'
}

const settings = createStore<MessageSettingsState>({ value: null, status: 'loading' })

let requested = false
/** Quando a última leitura falhou: a próxima tela que pedir só tenta de novo depois de um tempo, senão cada renderização pediria outra. */
let failedAt = 0
const RETRY_AFTER_MS = 10_000

/** Lê as configurações uma vez; quem salva na tela de configurações atualiza com `setMessageSettings`. */
function load({ force = false } = {}) {
	if (requested || (!force && Date.now() - failedAt < RETRY_AFTER_MS)) return
	requested = true

	api.settings('message').then(
		value => settings.set({ value, status: 'ready' }),
		() => {
			// Sem as configurações, a mensagem sai sem assinatura; a próxima tela que pedir tenta de novo (depois de um tempo)
			requested = false
			failedAt = Date.now()
			settings.set(current => ({ ...current, status: 'failed' }))
		},
	)
}

export function setMessageSettings(value: WebSettings['message']) {
	settings.set({ value, status: 'ready' })
}

/** A assinatura colada no fim das mensagens para copiar (vazia até carregar ou quando não há). */
export function useMessageSignature() {
	load()
	return useStore(settings).value?.signature ?? ''
}

/**
 * A assinatura e se ela já foi lida, para quem monta um texto editável e não pode trocá-lo depois que a pessoa começou
 * a editar (a modal do contato): espera `ready`, ou avisa em `failed` e oferece `retry`.
 */
export function useMessageSignatureState() {
	load()
	const { value, status } = useStore(settings)

	return {
		signature: value?.signature ?? '',
		status,
		retry: () => {
			settings.set(current => ({ ...current, status: 'loading' }))
			load({ force: true })
		},
	}
}
