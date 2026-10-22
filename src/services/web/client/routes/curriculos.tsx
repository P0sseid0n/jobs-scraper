import { createFileRoute } from '@tanstack/react-router'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { loadCvRequestsOrThrow } from '../stores/cv'
import { CvsView } from '../views/CvsView'

export const Route = createFileRoute('/curriculos')({
	staticData: { title: 'Meus currículos' },
	// A cada visita, para incluir os pedidos feitos em outra aba. Sem o currículo base, a lista aparece mesmo assim
	loader: async () => {
		const [cvBase] = await Promise.all([api.cvBase().catch(() => null), loadCvRequestsOrThrow()])
		return { baseVersions: cvBase?.versions ?? null }
	},
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar os currículos', 'medium'),
	component: () => <CvsView baseVersions={Route.useLoaderData().baseVersions} />,
})
