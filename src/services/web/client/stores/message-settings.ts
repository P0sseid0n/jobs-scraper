import type { WebSettings } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'

/** As configurações da mensagem de candidatura; `null` até a primeira leitura (ou se ela falhou). */
const settings = createStore<WebSettings['message'] | null>(null)

let requested = false

/** Lê as configurações uma vez; quem salva na tela de configurações atualiza com `setMessageSettings`. */
function load() {
	if (requested) return
	requested = true

	api.settings('message').then(
		value => settings.set(value),
		() => {
			// Sem as configurações, a mensagem sai sem assinatura; tenta de novo na próxima tela que pedir
			requested = false
		},
	)
}

export function setMessageSettings(value: WebSettings['message']) {
	settings.set(value)
}

/** A assinatura colada no fim das mensagens para copiar (vazia até carregar ou quando não há). */
export function useMessageSignature() {
	load()
	return useStore(settings)?.signature ?? ''
}
