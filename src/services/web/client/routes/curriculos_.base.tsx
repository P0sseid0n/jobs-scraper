import { createFileRoute } from '@tanstack/react-router'

import { api } from '../api'
import { routeError, RoutePending } from '../components/RouteStatus'
import { activeVersion } from '../lib/cv-base'
import { CvBaseView, type CvBaseData } from '../views/CvBaseView'

export const Route = createFileRoute('/curriculos_/base')({
	staticData: { title: 'Currículo base' },
	loader: async (): Promise<CvBaseData> => {
		const { versions } = await api.cvBase()
		const active = activeVersion(versions)
		// O editor (ou o formulário, se a versão veio dele) começa com a versão ativa, para mudar só o que precisa
		const current = active ? await api.cvBaseVersion(active.versionId) : null

		return { versions, activeTex: current?.tex ?? '', activeForm: current?.form ?? null }
	},
	pendingComponent: () => <RoutePending width="medium" />,
	errorComponent: routeError('Não consegui carregar o currículo base', 'medium'),
	component: () => <CvBaseView initial={Route.useLoaderData()} />,
})
