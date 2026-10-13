import { createFileRoute } from '@tanstack/react-router'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { RunsView } from '../views/RunsView'

export const Route = createFileRoute('/coletas')({
	staticData: { title: 'Coletas' },
	loader: async () => {
		const [status, runs] = await Promise.all([api.scraperStatus(), api.runs()])
		return { status, runs }
	},
	pendingComponent: () => <RoutePending />,
	errorComponent: routeError('Não consegui carregar as coletas'),
	component: () => <RunsView initial={Route.useLoaderData()} />,
})
