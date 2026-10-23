import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { api } from '../api'
import { ONBOARDING_STEPS, resumeStep } from '../components/onboarding/steps'
import { routeError, RoutePending } from '../components/RouteStatus'
import { loadSetup } from '../stores/setup'
import { OnboardingView, type OnboardingData } from '../views/OnboardingView'

/** O passo na URL; sem ele (ou inválido), o onboarding retoma de onde a pessoa parou. */
const onboardingSearch = z.object({ passo: z.enum(ONBOARDING_STEPS).optional().catch(undefined) })

export const Route = createFileRoute('/boas-vindas')({
	staticData: { title: 'Boas-vindas' },
	validateSearch: onboardingSearch,
	// Os dados são lidos uma vez ao abrir; cada passo relê o que precisa depois de salvar
	staleTime: Number.POSITIVE_INFINITY,
	loader: async (): Promise<OnboardingData> => {
		const [setup, profile, scraper, processing, credentials, cvBase] = await Promise.all([
			loadSetup({ fresh: true }).then(value => value ?? api.setup()),
			api.settings('profile'),
			api.settings('scraper'),
			api.settings('post-processing'),
			api.credentials(),
			api.cvBase(),
		])
		return { setup, settings: { profile, scraper, 'post-processing': processing }, credentials, cvVersions: cvBase.versions }
	},
	pendingComponent: () => <RoutePending width="narrow" />,
	errorComponent: routeError('Não consegui abrir as boas-vindas', 'narrow'),
	component: () => {
		const initial = Route.useLoaderData()
		const { passo } = Route.useSearch()
		return <OnboardingView initial={initial} step={passo ?? resumeStep(initial.setup)} />
	},
})
