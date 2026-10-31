import type { SetupStatus } from '../../../api-types'

/** Os passos do onboarding, na ordem, como aparecem na URL (`/onboarding?step=linkedin`); `welcome` é a abertura. */
export const ONBOARDING_STEPS = ['welcome', 'field', 'linkedin', 'resume', 'extras', 'email', 'review'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Os passos numerados (todos menos a abertura); o nome curto de cada um fica em `onboarding.steps`. */
export const NUMBERED_STEPS: Exclude<OnboardingStep, 'welcome'>[] = ['field', 'linkedin', 'resume', 'extras', 'email', 'review']

/** Se o passo já está feito (a abertura e a revisão não têm o que fazer; os extras contam com qualquer um deles). */
export function stepDone(step: OnboardingStep, setup: SetupStatus) {
	switch (step) {
		case 'field':
			return setup.steps.profile
		case 'linkedin':
			return setup.steps.linkedin
		case 'resume':
			return setup.steps.cv
		case 'extras':
			return setup.steps.discord || setup.steps.github
		case 'email':
			return setup.steps.email
		default:
			return false
	}
}

/**
 * Onde retomar: a abertura se nada foi feito; senão, o primeiro passo obrigatório que falta; com o mínimo pronto, a
 * revisão. Assim, sair no meio e voltar cai no passo em que a pessoa parou.
 */
export function resumeStep(setup: SetupStatus): OnboardingStep {
	const { profile, linkedin, cv } = setup.steps
	if (!profile && !linkedin && !cv) return 'welcome'
	if (!profile) return 'field'
	if (!linkedin) return 'linkedin'
	if (!cv) return 'resume'
	return 'review'
}
