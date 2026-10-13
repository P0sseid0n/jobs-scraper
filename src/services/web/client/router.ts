import type { MouseEvent } from 'react'

import { jobRouteId } from '../job-route-id'
import { createStore, useStore } from './lib/store'

/** Roteador mínimo sobre a History API: o servidor devolve a aplicação em qualquer caminho fora de `/api`. */
export const route = createStore({ path: location.pathname })

export function useRoute() {
	return useStore(route)
}

window.addEventListener('popstate', sync)

/** Quantas telas da aplicação há antes da atual no histórico (guardado no `history.state` de cada entrada). */
function depth() {
	return (history.state as { depth?: number } | null)?.depth ?? 0
}

/** `scroll: false` mantém a rolagem (ex.: trocar a vaga do painel ao lado da lista). */
export function navigate(to: string, { replace = false, scroll = true } = {}) {
	if (to === location.pathname + location.search) return

	if (replace) history.replaceState({ depth: depth() }, '', to)
	else history.pushState({ depth: depth() + 1 }, '', to)

	sync()
	if (!replace && scroll) window.scrollTo({ top: 0 })
}

/** Volta para a tela anterior da aplicação; se a página foi aberta direto (link), vai para `fallback`. */
export function goBack(fallback: string) {
	if (depth() > 0) history.back()
	else navigate(fallback, { replace: true })
}

function sync() {
	route.set({ path: location.pathname })
}

/** Lê `:param` de um padrão como `/vagas/:id`; `null` se o caminho não casa. */
export function matchPath(pattern: string, path = route.get().path) {
	const names: string[] = []
	const regex = new RegExp(
		`^${pattern.replace(/:(\w+)/g, (_, name: string) => {
			names.push(name)
			return '([^/]+)'
		})}/?$`,
	)
	const match = regex.exec(path)
	if (!match) return null

	return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1]!)]))
}

/** `/vagas/7515393090820456448`: o id curto, sem o `urn:li:<tipo>:` do LinkedIn. */
export function jobPath(postId: string) {
	return `/vagas/${encodeURIComponent(jobRouteId(postId))}`
}

/** Clique normal num link interno navega sem recarregar; com Ctrl/Cmd/meio, o navegador abre outra aba. */
export function onLinkClick(event: MouseEvent<HTMLElement>) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

	const anchor = event.currentTarget.closest('a')
	const href = anchor?.getAttribute('href')
	if (!href?.startsWith('/') || anchor?.target === '_blank') return

	event.preventDefault()
	navigate(href)
}
