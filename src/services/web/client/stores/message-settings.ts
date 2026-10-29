import type { WebSettings } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'

type MessageSettingsState = {
	/** As configurações da mensagem de candidatura; `null` até a primeira leitura (ou se ela falhou). */
	value: WebSettings['message'] | null
	/** O perfil, para as variáveis `{{area}}` e `{{cargo_alvo}}` do modelo; lido junto. */
	profile: WebSettings['profile'] | null
	/** `loading` também antes da primeira leitura; `failed` até alguém pedir de novo. */
	status: 'loading' | 'ready' | 'failed'
}

const settings = createStore<MessageSettingsState>({ value: null, profile: null, status: 'loading' })

let requested = false
/** Quando a última leitura falhou: a próxima tela que pedir só tenta de novo depois de um tempo, senão cada renderização pediria outra. */
let failedAt = 0
const RETRY_AFTER_MS = 10_000

/**
 * Lê as configurações (e o perfil) uma vez; quem salva na tela de configurações atualiza com `setMessageSettings` e
 * `setMessageProfile`.
 */
function load({ force = false } = {}) {
	if (requested || (!force && Date.now() - failedAt < RETRY_AFTER_MS)) return
	requested = true

	Promise.all([api.settings('message'), api.settings('profile')]).then(
		([value, profile]) => settings.set({ value, profile, status: 'ready' }),
		() => {
			// Sem as configurações, a mensagem sai sem assinatura e com o modelo padrão; a próxima tela que pedir tenta de novo
			// (depois de um tempo)
			requested = false
			failedAt = Date.now()
			settings.set(current => ({ ...current, status: 'failed' }))
		},
	)
}

export function setMessageSettings(value: WebSettings['message']) {
	settings.set(current => ({ ...current, value, status: current.profile ? 'ready' : current.status }))
}

export function setMessageProfile(profile: WebSettings['profile']) {
	settings.set(current => ({ ...current, profile, status: current.value ? 'ready' : current.status }))
}

/** A assinatura colada no fim das mensagens para copiar (vazia até carregar ou quando não há). */
export function useMessageSignature() {
	load()
	return useStore(settings).value?.signature ?? ''
}

/**
 * As configurações da mensagem e o perfil, e se já foram lidos, para quem monta um texto editável e não pode trocá-lo
 * depois que a pessoa começou a editar (a modal do contato): espera `ready`, ou avisa em `failed` e oferece `retry`.
 */
export function useMessageSettingsState() {
	load()
	const { value, profile, status } = useStore(settings)

	return {
		settings: value,
		profile,
		signature: value?.signature ?? '',
		status,
		retry: () => {
			settings.set(current => ({ ...current, status: 'loading' }))
			load({ force: true })
		},
	}
}
