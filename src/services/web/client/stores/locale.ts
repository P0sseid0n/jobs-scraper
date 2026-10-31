import { isLocale, localizeZodErrors, messagesFor, resolveLocale, setLocaleSource, type Locale } from '@shared/i18n'

import { api } from '../api'
import { storage } from '../lib/storage'
import { createStore, useStore } from '../lib/store'

const KEY = 'locale'

/**
 * O idioma do sistema. Vale o salvo nas configurações (lido por todos os serviços); o localStorage é só o espelho para
 * a primeira pintura sair no idioma certo antes de a API responder, como o tema. Sem nenhum dos dois, o do navegador.
 */
export const locale = createStore<Locale>(initialLocale())

function initialLocale(): Locale {
	const mirrored = storage.get<unknown>(KEY, null)
	return isLocale(mirrored) ? mirrored : resolveLocale(globalThis.navigator?.languages ?? [])
}

function apply() {
	// Fora do navegador (nos testes), só o idioma dos textos importa
	if (typeof document !== 'undefined') document.documentElement.lang = locale.get()
	storage.set(KEY, locale.get())
}

setLocaleSource(locale.get)
localizeZodErrors()
apply()
locale.subscribe(apply)

/**
 * Lê o idioma salvo. Enquanto ninguém escolheu (`null`), salva o que está na tela (o do navegador): assim o Discord e
 * a validação seguem o mesmo idioma do site desde a primeira visita.
 */
export async function loadLocale() {
	try {
		const saved = await api.settings('language')
		if (saved.locale) locale.set(saved.locale)
		else await api.saveSettings('language', { locale: locale.get() })
	} catch {
		// sem a API, fica o do espelho (ou do navegador)
	}
}

/** Troca o idioma na hora e o salva; se o salvar falhar, a tela fica no idioma novo e o erro sobe para quem chamou. */
export async function changeLocale(next: Locale) {
	locale.set(next)
	await api.saveSettings('language', { locale: next })
}

/** Os textos do idioma escolhido; o componente renderiza de novo quando ele muda. */
export function useT() {
	return messagesFor(useStore(locale))
}

export function useLocale() {
	return useStore(locale)
}
