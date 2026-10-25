import type { LinkedinLoginState } from '../../api-types'

type Status = LinkedinLoginState['status']

/** As etapas do login do LinkedIn na linha do tempo; a confirmação só acontece quando o LinkedIn pede. */
export const LOGIN_STEPS = ['pedido', 'entrando', 'confirmação', 'conectado'] as const

/** `skipped`: a confirmação, num login que deu certo sem ela ter sido pedida (nesta tela). */
export type LoginStepState = 'done' | 'current' | 'failed' | 'skipped' | 'upcoming'

/** Até onde o login chegou nesta tela: a etapa mais adiantada e se a confirmação foi pedida. */
export type LoginReached = { step: number; verification: boolean }

const LAST = LOGIN_STEPS.length - 1
const STEP_OF: Record<Exclude<Status, 'failed'>, number> = { pending: 0, running: 1, verification: 2, success: LAST }

/** Etapa de cada status; a falha fica onde o login estava (`reached`, pelo menos "entrando"). */
export function loginStep(status: Status, reached: LoginReached) {
	return status === 'failed' ? Math.max(reached.step, STEP_OF.running) : STEP_OF[status]
}

/** O estado de cada etapa e quanto da linha entre a primeira e a última está preenchido (de 0 a 1). */
export function loginProgress(status: Status, reached: LoginReached): { states: LoginStepState[]; fill: number } {
	const current = loginStep(status, reached)

	const states = LOGIN_STEPS.map((_, index): LoginStepState => {
		if (status === 'success') return index === STEP_OF.verification && !reached.verification ? 'skipped' : 'done'
		if (index < current) return index === STEP_OF.verification && !reached.verification ? 'skipped' : 'done'
		if (index === current) return status === 'failed' ? 'failed' : 'current'
		return 'upcoming'
	})

	return { states, fill: current / LAST }
}
