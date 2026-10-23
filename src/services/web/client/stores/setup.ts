import type { SetupStatus } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'

/** O último `GET /api/setup`; `null` antes do primeiro ou se ele falhou (aí o site abre normalmente). */
const setup = createStore<SetupStatus | null>(null)

// Releitura ao navegar: uma conta apagada em Configurações volta a pedir o onboarding sem recarregar a página
const MAX_AGE_MS = 30_000
let loadedAt = 0
let loading: Promise<SetupStatus | null> | null = null

/** O estado do onboarding, relido se tiver mais de 30 s (ou sempre, com `fresh`). Falha da API vira `null`. */
export function loadSetup({ fresh = false } = {}) {
	if (!fresh && Date.now() - loadedAt < MAX_AGE_MS) return Promise.resolve(setup.get())

	loading ??= api
		.setup()
		.then(
			status => {
				setup.set(status)
				loadedAt = Date.now()
				return status
			},
			() => null,
		)
		.finally(() => {
			loading = null
		})

	return loading
}

/** Se o site deve levar ao onboarding: falta o mínimo e o `.env` não manda pular. */
export function needsOnboarding(status: SetupStatus | null) {
	return !!status && !status.skipOnboarding && !status.ready
}

export function useSetup() {
	return useStore(setup)
}
