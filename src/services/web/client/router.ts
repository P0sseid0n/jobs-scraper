import { reactive } from 'vue'

/** Roteador mínimo sobre a History API: o servidor devolve a aplicação em qualquer caminho fora de `/api`. */
export const route = reactive({ path: location.pathname, query: new URLSearchParams(location.search) })

window.addEventListener('popstate', sync)

/** Quantas telas da aplicação há antes da atual no histórico (guardado no `history.state` de cada entrada). */
function depth() {
	return (history.state as { depth?: number } | null)?.depth ?? 0
}

export function navigate(to: string, { replace = false } = {}) {
	if (to === location.pathname + location.search) return

	if (replace) history.replaceState({ depth: depth() }, '', to)
	else history.pushState({ depth: depth() + 1 }, '', to)

	sync()
	if (!replace) window.scrollTo({ top: 0 })
}

/** Volta para a tela anterior da aplicação; se a página foi aberta direto (link), vai para `fallback`. */
export function goBack(fallback: string) {
	if (depth() > 0) history.back()
	else navigate(fallback, { replace: true })
}

function sync() {
	route.path = location.pathname
	route.query = new URLSearchParams(location.search)
}

/** Lê `:param` de um padrão como `/vagas/:postId`; `null` se o caminho não casa. */
export function matchPath(pattern: string, path = route.path) {
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

export function jobPath(postId: string) {
	return `/vagas/${encodeURIComponent(postId)}`
}

/** Clique normal num link interno navega sem recarregar; com Ctrl/Cmd/meio, o navegador abre outra aba. */
export function onLinkClick(event: MouseEvent) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

	const anchor = (event.currentTarget as HTMLElement).closest('a')
	const href = anchor?.getAttribute('href')
	if (!href?.startsWith('/') || anchor?.target === '_blank') return

	event.preventDefault()
	navigate(href)
}
