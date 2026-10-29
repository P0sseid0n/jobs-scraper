import type { CredentialGroup } from '../../api-types'
import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

const KEY = 'accountTutorialOpen'

/** Se o tutorial da conta aparece ao lado do formulário no onboarding; fechado, vira o botão "como configurar". Lembrado entre visitas. */
export const accountTutorialOpen = createStore(storage.get(KEY, true))

accountTutorialOpen.subscribe(() => storage.set(KEY, accountTutorialOpen.get()))

/**
 * Um pedido de fora do formulário da conta para abrir o tutorial dela num passo (ex.: o teste do login do LinkedIn que
 * falhou aponta para o cookie li_at). O `AccountGroup` da conta abre o tutorial e o "avançado"; `at` repete o pedido.
 */
export const accountTutorialRequest = createStore<{ group: CredentialGroup; step: string; at: number } | null>(null)

export function requestAccountTutorial(group: CredentialGroup, step: string) {
	accountTutorialRequest.set({ group, step, at: Date.now() })
}
