import { createRouter } from '@tanstack/react-router'

import type { Messages } from '@shared/i18n'

import { jobRouteId } from '../job-route-id'
import { routeError, RoutePending } from './components/RouteStatus'
import { routeTree } from './routeTree.gen'

/**
 * As rotas vêm dos arquivos de `routes/` (a árvore `routeTree.gen.ts` é gerada pelo `tsr`, no `bun dev:web` ou com
 * `bun routes`). O servidor devolve a aplicação em qualquer caminho fora de `/api`.
 */
export const router = createRouter({
	routeTree,
	scrollRestoration: true,
	// Para as rotas que não definem os seus (cada tela define o título do erro)
	defaultPendingComponent: () => <RoutePending />,
	defaultErrorComponent: routeError('default'),
})

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}

	interface StaticDataRouteOption {
		/** Título da aba (`<título> · jobs/scraper`), pela chave em `routes.titles` do catálogo. */
		title?: keyof Messages['routes']['titles']
	}
}

/** Os caminhos de antes das rotas em inglês, e os de hoje. */
const LEGACY_PATHS: [RegExp, string][] = [
	[/^\/boas-vindas(?=\/|$)/, '/onboarding'],
	[/^\/vagas\//, '/jobs/'],
	[/^\/coletas(?=\/|$)/, '/runs'],
	[/^\/curriculos(?=\/|$)/, '/resumes'],
	[/^\/configuracoes(?=\/|$)/, '/settings'],
]

/** Troca na barra de endereço um caminho de antes das rotas em inglês pelo de hoje, antes de o router ler a URL. */
export function redirectLegacyPath() {
	const { pathname, search, hash } = window.location
	const match = LEGACY_PATHS.find(([legacy]) => legacy.test(pathname))
	if (match) window.history.replaceState(null, '', pathname.replace(match[0], match[1]) + search + hash)
}

/** Os parâmetros de `/jobs/$id`: o id curto, sem o `urn:li:<tipo>:` do LinkedIn (`/vagas/7515393090820456448`). */
export function jobParams(postId: string) {
	return { id: jobRouteId(postId) }
}
