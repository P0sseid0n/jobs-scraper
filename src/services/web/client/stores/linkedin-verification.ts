import type { LinkedinLoginState } from '../../api-types'
import { api } from '../api'
import { createStore, useStore } from '../lib/store'
import { notify } from './toast'

/** Parado, confere a cada 5 s se o LinkedIn pediu uma verificação; com uma aberta, a cada 2 s. */
const IDLE_POLL_MS = 5_000
const ACTIVE_POLL_MS = 2_000

type VerificationView = {
	login: LinkedinLoginState | null
	/** A verificação fechada pela pessoa (a chave dela): só uma nova abre a modal de novo. */
	dismissed: string | null
}

const store = createStore<VerificationView>({ login: null, dismissed: null })

/** Identifica a verificação em andamento: o prazo dela muda a cada novo login. */
export function verificationKey(login: LinkedinLoginState | null) {
	return login?.status === 'verification' ? (login.expiresAt ?? login.updatedAt) : null
}

export function useLinkedinVerification() {
	return useStore(store)
}

/** Lê o login agora; ao sair de uma verificação, avisa como ela terminou. */
export async function refreshLinkedinVerification() {
	const login = await api.linkedinLogin().catch(() => store.get().login)
	const previous = store.get().login

	if (previous?.status === 'verification' && login && login.status !== 'verification') {
		if (login.status === 'success') notify('Pronto: o LinkedIn confirmou que é você')
		else if (login.status === 'failed') {
			notify('A verificação do LinkedIn não foi concluída. Teste o login de novo em Configurações › Contas.', 'error')
		}
	}
	store.set(current => ({ ...current, login }))
	return login
}

export function dismissLinkedinVerification() {
	store.set(current => ({ ...current, dismissed: verificationKey(current.login) }))
}

export function reopenLinkedinVerification() {
	store.set(current => ({ ...current, dismissed: null }))
}

/** Acompanha o login do LinkedIn enquanto o site está aberto (a modal da verificação usa isso). */
export function watchLinkedinVerification() {
	let timer: ReturnType<typeof setTimeout> | undefined
	let alive = true

	const tick = async () => {
		const login = await refreshLinkedinVerification()
		if (alive) timer = setTimeout(tick, login?.status === 'verification' ? ACTIVE_POLL_MS : IDLE_POLL_MS)
	}
	void tick()

	return () => {
		alive = false
		clearTimeout(timer)
	}
}
