import { createFileRoute } from '@tanstack/react-router'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { SettingsView } from '../views/SettingsView'

export const Route = createFileRoute('/configuracoes')({
	staticData: { title: 'Configurações' },
	loader: async () => {
		const [scraper, processing] = await Promise.all([api.settings('scraper'), api.settings('post-processing')])
		return { scraper, 'post-processing': processing }
	},
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar as configurações', 'medium'),
	component: () => <SettingsView initial={Route.useLoaderData()} />,
})
