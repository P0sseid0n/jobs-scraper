import type { SetupStatus } from '../../../api-types'

/** Os passos do onboarding, na ordem, como aparecem na URL (`/boas-vindas?passo=linkedin`); `inicio` é a abertura. */
export const ONBOARDING_STEPS = ['inicio', 'area', 'linkedin', 'curriculo', 'extras', 'revisao'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Os passos numerados (todos menos a abertura), com o nome curto da lista de passos. */
export const NUMBERED_STEPS: { step: Exclude<OnboardingStep, 'inicio'>; label: string }[] = [
	{ step: 'area', label: 'Sua área' },
	{ step: 'linkedin', label: 'LinkedIn' },
	{ step: 'curriculo', label: 'Currículo' },
	{ step: 'extras', label: 'Extras' },
	{ step: 'revisao', label: 'Revisão' },
]

/** Se o passo já está feito (a abertura e a revisão não têm o que fazer; os extras contam com qualquer um deles). */
export function stepDone(step: OnboardingStep, setup: SetupStatus) {
	switch (step) {
		case 'area':
			return setup.steps.profile
		case 'linkedin':
			return setup.steps.linkedin
		case 'curriculo':
			return setup.steps.cv
		case 'extras':
			return setup.steps.discord || setup.steps.github
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
	if (!profile && !linkedin && !cv) return 'inicio'
	if (!profile) return 'area'
	if (!linkedin) return 'linkedin'
	if (!cv) return 'curriculo'
	return 'revisao'
}
