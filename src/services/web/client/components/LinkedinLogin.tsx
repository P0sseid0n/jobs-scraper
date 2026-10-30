import { useEffect, useState } from 'react'

import type { LinkedinLoginState } from '../../api-types'
import { api } from '../api'
import { cx } from '../lib/cx'
import { LOGIN_STEPS, loginProgress, loginStep, type LoginReached, type LoginStepState } from '../lib/login-steps'
import { requestAccountTutorial } from '../stores/account-tutorial'
import { reopenLinkedinVerification } from '../stores/linkedin-verification'
import { notify } from '../stores/toast'
import { DrawnCheck, Icon } from './Icon'
import { Button } from './ui/Button'
import { FieldHelp } from './ui/Field'
import { Notice } from './ui/Notice'
import { TextLink } from './ui/TextLink'

const POLL_MS = 2_000
/** Sem o scraper pegar o pedido nesse tempo, provavelmente ele não está rodando. */
const STALLED_MS = 30_000
/** Um login de uma coleta que terminou há mais que isso não é mostrado: não tem a ver com o que a pessoa está fazendo. */
const RECENT_MS = 10 * 60_000

const ACTIVE = new Set<LinkedinLoginState['status']>(['pending', 'running', 'verification'])

/**
 * O teste do login do LinkedIn: pede ao scraper, acompanha o andamento a cada 2 s e entrega o código de verificação.
 * A verificação pedida pelo LinkedIn (num teste ou numa coleta) abre na modal `LinkedinVerificationDialog`.
 */
export function useLinkedinLogin() {
	const [state, setState] = useState<LinkedinLoginState | null>(null)
	const [startedAt, setStartedAt] = useState<number | null>(null)
	const [starting, setStarting] = useState(false)
	const [reached, setReached] = useState<LoginReached>({ step: 0, verification: false })

	const active = starting || (!!state && ACTIVE.has(state.status))
	const status = state?.status

	// A linha do tempo lembra até onde o login chegou (a falha fica nessa etapa) e se a confirmação foi pedida
	useEffect(() => {
		if (!status) return
		setReached(current => ({
			step: Math.max(current.step, loginStep(status, current)),
			verification: current.verification || status === 'verification',
		}))
	}, [status])

	useEffect(() => {
		let alive = true
		const load = () =>
			api.linkedinLogin().then(
				value => alive && setState(value),
				() => {},
			)

		void load()
		// Parado, lê uma vez; em andamento, a cada 2 s
		const timer = active ? setInterval(load, POLL_MS) : undefined
		return () => {
			alive = false
			clearInterval(timer)
		}
	}, [active])

	async function start() {
		setStarting(true)
		setStartedAt(Date.now())
		setReached({ step: 0, verification: false })
		try {
			setState(await api.testLinkedinLogin())
		} catch (error) {
			notify(`Não consegui pedir o teste: ${(error as Error).message}`, 'error')
		} finally {
			setStarting(false)
		}
	}

	const updatedAt = state ? Date.parse(state.updatedAt) : 0
	const visible =
		!!state && (ACTIVE.has(state.status) || (startedAt !== null && updatedAt >= startedAt) || Date.now() - updatedAt < RECENT_MS)
	const stalled = state?.status === 'pending' && !!state.requestedAt && Date.now() - Date.parse(state.requestedAt) > STALLED_MS

	return { state: visible ? state : null, reached, active, stalled, start }
}

/**
 * O andamento do login: a linha do tempo (pedido, entrando, confirmação, conectado) e, embaixo, o que está acontecendo:
 * esperando, entrando, a verificação pedida (QR, código, app), o sucesso ou a falha.
 */
export function LinkedinLoginStatus({ login }: { login: ReturnType<typeof useLinkedinLogin> }) {
	const { state, reached } = login
	if (!state) return null

	return (
		<div className="flex flex-col gap-4 animate-panel-in motion-reduce:animate-none">
			<LoginTimeline {...loginProgress(state.status, reached)} />
			<LoginDetails login={login} />
		</div>
	)
}

const STEP_STATE_TEXT: Record<LoginStepState, string> = {
	done: 'concluída',
	current: 'em andamento',
	failed: 'falhou',
	skipped: 'não foi pedida',
	upcoming: 'a seguir',
}

/** As etapas ligadas por uma linha que se preenche até a atual; cada bolinha muda com a etapa. */
function LoginTimeline({ states, fill }: ReturnType<typeof loginProgress>) {
	return (
		<ol className="relative m-0 grid list-none grid-cols-4 p-0" aria-label="Andamento do login">
			{/* A linha vai do centro da primeira bolinha ao da última (cada coluna tem 1/4 da largura) */}
			<span aria-hidden="true" className="absolute inset-x-1/8 top-3 h-0.5 -translate-y-1/2 rounded-pill bg-line">
				<span
					className="block h-full rounded-pill bg-lime-accent transition-all duration-700 ease-glide motion-reduce:transition-none"
					style={{ width: `${fill * 100}%` }}
				/>
			</span>
			{LOGIN_STEPS.map((step, index) => {
				const state = states[index]!

				return (
					<li key={step} className="relative flex flex-col items-center gap-1.5 text-center">
						<StepDot state={state} />
						<span
							className={cx(
								'font-mono text-xs',
								state === 'failed' ? 'text-danger' : state === 'current' ? 'text-ink' : 'text-muted',
							)}
						>
							{step}
							<span className="sr-only">: {STEP_STATE_TEXT[state]}</span>
						</span>
					</li>
				)
			})}
		</ol>
	)
}

/** A bolinha da etapa: concluída (check desenhado), atual (pulsando), falhou (treme), pulada (tracejada) ou a seguir. */
function StepDot({ state }: { state: LoginStepState }) {
	const base = 'relative grid size-6 place-items-center rounded-full'

	switch (state) {
		case 'done':
			return (
				<span className={cx(base, 'bg-lime text-lime-ink animate-pop motion-reduce:animate-none')}>
					<DrawnCheck size={14} />
				</span>
			)
		case 'current':
			return (
				<span className={cx(base, 'border-2 border-lime-accent bg-surface')}>
					<span className="absolute -inset-0.5 rounded-full border-2 border-lime-accent animate-ping motion-reduce:hidden" />
					<span className="size-2 rounded-full bg-lime-accent" />
				</span>
			)
		case 'failed':
			return (
				<span className={cx(base, 'bg-danger-bg text-danger animate-shake motion-reduce:animate-none')}>
					<Icon name="close" size={14} />
				</span>
			)
		case 'skipped':
			return <span className={cx(base, 'border border-dashed border-control bg-surface')} />
		case 'upcoming':
			return <span className={cx(base, 'border-2 border-control bg-surface')} />
	}
}

function LoginDetails({ login }: { login: ReturnType<typeof useLinkedinLogin> }) {
	const { state, stalled } = login
	if (!state) return null

	if (state.status === 'pending' || state.status === 'running') {
		return (
			<div className="flex flex-col gap-2" role="status">
				<p className="flex items-center gap-2 text-sm">
					<Icon name="spinner" />
					{state.status === 'pending' ? 'Esperando o scraper começar o teste…' : 'Entrando no LinkedIn…'}
				</p>
				{state.message && <FieldHelp>{state.message}</FieldHelp>}
				{stalled && (
					<Notice tone="warn" icon="alert">
						<p>
							O scraper ainda não pegou o pedido. Ele está rodando? Confira se o <code className="font-mono">bun dev</code> (ou
							o <code className="font-mono">docker compose --profile app up</code>) está ligado. O teste começa sozinho quando
							ele subir.
						</p>
					</Notice>
				)}
			</div>
		)
	}

	if (state.status === 'verification') return <Verification />

	return (
		<p
			role="status"
			className={cx(
				'flex items-start gap-2 text-sm animate-panel-in motion-reduce:animate-none',
				state.status === 'success' ? 'text-ok' : 'text-danger',
			)}
		>
			{state.status === 'success' ? <DrawnCheck className="mt-0.5" /> : <Icon name="alert" className="mt-0.5" />}
			<span>
				{state.status === 'success'
					? 'Tudo certo: conseguimos entrar no LinkedIn com a sua conta.'
					: 'Não deu para entrar no LinkedIn.'}
				{state.message && state.status === 'failed' && <span className="block text-muted">{state.message}</span>}
				{/* Sem conseguir entrar (ou confirmar o acesso), o cookie de uma sessão já logada é a saída */}
				{state.status === 'failed' && (
					<span className="block text-ink">
						Não conseguiu confirmar o acesso?{' '}
						<TextLink size="sm" onClick={() => requestAccountTutorial('linkedin', 'li-at')}>
							entre com o cookie li_at
						</TextLink>
					</span>
				)}
			</span>
		</p>
	)
}

/** A verificação em andamento fica na modal (`LinkedinVerificationDialog`); aqui, só o aviso e o botão para reabri-la. */
function Verification() {
	return (
		<div
			className="flex flex-wrap items-center gap-3 rounded-md bg-lime-soft p-4 animate-pop-in motion-reduce:animate-none"
			role="status"
		>
			<p className="grow text-sm">
				<span className="font-semibold">O LinkedIn quer confirmar que é você.</span> Resolva na janela da verificação.
			</p>
			<Button variant="lime" size="sm" onClick={reopenLinkedinVerification}>
				abrir a verificação
			</Button>
		</div>
	)
}
