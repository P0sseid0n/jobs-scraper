import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { CREDENTIAL_GROUPS, type CredentialGroup } from '@shared/contracts'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { SettingsView } from '../views/SettingsView'

/**
 * `conta`: a aba de Configurações › Contas que abre selecionada (ex.: `?conta=smtp#contas`, do "configure a conta de
 * e-mail"). A seção vem pelo hash (`#contas`, `#coleta`), que o router rola até ela.
 */
const settingsSearch = z.object({
	conta: z
		.enum(CREDENTIAL_GROUPS as [CredentialGroup, ...CredentialGroup[]])
		.optional()
		.catch(undefined),
})

export const Route = createFileRoute('/configuracoes')({
	staticData: { title: 'Configurações' },
	validateSearch: settingsSearch,
	loader: async () => {
		const [scraper, processing, profile, message, credentials] = await Promise.all([
			api.settings('scraper'),
			api.settings('post-processing'),
			api.settings('profile'),
			api.settings('message'),
			api.credentials(),
		])
		return { settings: { scraper, 'post-processing': processing, profile, message }, credentials }
	},
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar as configurações', 'medium'),
	component: () => {
		const { settings, credentials } = Route.useLoaderData()
		const { conta } = Route.useSearch()
		return <SettingsView initial={settings} credentials={credentials} account={conta} />
	},
})
