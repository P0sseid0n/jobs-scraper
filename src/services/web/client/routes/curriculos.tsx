import { createFileRoute } from '@tanstack/react-router'

import { routeError, RoutePending } from '../components/RouteStatus'
import { loadCvRequestsOrThrow } from '../stores/cv'
import { CvsView } from '../views/CvsView'

export const Route = createFileRoute('/curriculos')({
	staticData: { title: 'Meus currículos' },
	// A cada visita, para incluir os pedidos feitos em outra aba
	loader: loadCvRequestsOrThrow,
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar os currículos', 'medium'),
	component: CvsView,
})
