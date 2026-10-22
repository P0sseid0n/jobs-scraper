import { createFileRoute } from '@tanstack/react-router'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { SettingsView } from '../views/SettingsView'

export const Route = createFileRoute('/configuracoes')({
	staticData: { title: 'Configurações' },
	loader: async () => {
		const [scraper, processing, profile, credentials] = await Promise.all([
			api.settings('scraper'),
			api.settings('post-processing'),
			api.settings('profile'),
			api.credentials(),
		])
		return { settings: { scraper, 'post-processing': processing, profile }, credentials }
	},
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar as configurações', 'medium'),
	component: () => {
		const { settings, credentials } = Route.useLoaderData()
		return <SettingsView initial={settings} credentials={credentials} />
	},
})
