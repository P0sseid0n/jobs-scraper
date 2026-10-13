import { createRouter } from '@tanstack/react-router'

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
	defaultErrorComponent: routeError('Algo deu errado nesta tela'),
})

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}

	interface StaticDataRouteOption {
		/** Título da aba (`<título> · jobs/scraper`). */
		title?: string
	}
}

/** Os parâmetros de `/vagas/$id`: o id curto, sem o `urn:li:<tipo>:` do LinkedIn (`/vagas/7515393090820456448`). */
export function jobParams(postId: string) {
	return { id: jobRouteId(postId) }
}
