import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { api } from '../api'
import { PROFILE_PARTS } from '../components/onboarding/ProfileStep'
import { ONBOARDING_STEPS, resumeStep } from '../components/onboarding/steps'
import { routeError, RoutePending } from '../components/RouteStatus'
import { loadSetup } from '../stores/setup'
import { OnboardingView, type OnboardingData } from '../views/OnboardingView'

/**
 * O passo na URL; sem ele (ou inválido), o onboarding retoma de onde a pessoa parou. `parte` é a do passo 1 ("sobre" ou
 * "busca").
 */
const onboardingSearch = z.object({
	step: z.enum(ONBOARDING_STEPS).optional().catch(undefined),
	part: z.enum(PROFILE_PARTS).optional().catch(undefined),
})

export const Route = createFileRoute('/onboarding')({
	staticData: { title: 'welcome' },
	validateSearch: onboardingSearch,
	// Os dados são lidos uma vez ao abrir; cada passo relê o que precisa depois de salvar
	staleTime: Number.POSITIVE_INFINITY,
	loader: async (): Promise<OnboardingData> => {
		const [setup, profile, scraper, processing, credentials, cvBase, language] = await Promise.all([
			loadSetup({ fresh: true }).then(value => value ?? api.setup()),
			api.settings('profile'),
			api.settings('scraper'),
			api.settings('post-processing'),
			api.credentials(),
			api.cvBase(),
			api.settings('language'),
		])
		return {
			setup,
			settings: { profile, scraper, 'post-processing': processing },
			credentials,
			cvVersions: cvBase.versions,
			cvLanguage: language.cvLanguage,
		}
	},
	pendingComponent: () => <RoutePending width="narrow" />,
	errorComponent: routeError('welcome', 'narrow'),
	component: () => {
		const initial = Route.useLoaderData()
		const { step, part } = Route.useSearch()
		return <OnboardingView initial={initial} step={step ?? resumeStep(initial.setup)} part={part} />
	},
})
