import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import type { SetupStatus, WebCredentials, WebCvBaseVersion } from '../../api-types'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { ExtrasStep, LinkedinStep } from '../components/onboarding/AccountSteps'
import { CvStep } from '../components/onboarding/CvStep'
import { Rise, StepBar, useCurrentSubSteps, useStepBar, type SubStepsState } from '../components/onboarding/parts'
import { defaultProfilePart, ProfileStep, type ProfilePart, type ProfileStepData } from '../components/onboarding/ProfileStep'
import { ReviewStep } from '../components/onboarding/ReviewStep'
import { WelcomeDemo } from '../components/onboarding/WelcomeDemo'
import { NUMBERED_STEPS, ONBOARDING_STEPS, stepDone, type OnboardingStep } from '../components/onboarding/steps'
import { IconButton } from '../components/ui/IconButton'
import { cx } from '../lib/cx'
import { loadSetup } from '../stores/setup'
import { toggleTheme } from '../stores/theme'
import { notify } from '../stores/toast'

export type OnboardingData = {
	setup: SetupStatus
	settings: ProfileStepData
	credentials: WebCredentials
	cvVersions: WebCvBaseVersion[]
}

const TOTAL = NUMBERED_STEPS.length

/**
 * O onboarding do primeiro acesso (`/boas-vindas`), numa tela só dele, sem o cabeçalho do site: a abertura e os cinco
 * passos (área, LinkedIn, currículo, extras e revisão). Cada passo salva ao continuar, então dá para sair e voltar; o
 * passo atual fica na URL (`?passo=`), e "voltar" do navegador também volta um passo.
 */
export function OnboardingView({
	initial,
	step,
	part,
}: {
	initial: OnboardingData
	step: OnboardingStep
	/** A parte do passo 1 na URL (`?parte=`); sem ela, a que faz sentido pelo perfil salvo. */
	part?: ProfilePart
}) {
	const navigate = useNavigate()
	const [setup, setSetup] = useState(initial.setup)
	const [settings, setSettings] = useState(initial.settings)
	const [credentials, setCredentials] = useState(initial.credentials)

	// O passo novo entra pelo lado para onde se andou
	const index = ONBOARDING_STEPS.indexOf(step)
	const previous = useRef(index)
	const direction = index >= previous.current ? 'next' : 'back'
	useEffect(() => {
		previous.current = index
		window.scrollTo({ top: 0 })
	}, [index])

	/** Relê o que já está configurado (e as configurações, para a revisão) depois de salvar um passo. */
	async function refresh() {
		try {
			const [fresh, profile, scraper, processing] = await Promise.all([
				loadSetup({ fresh: true }).then(value => value ?? api.setup()),
				api.settings('profile'),
				api.settings('scraper'),
				api.settings('post-processing'),
			])
			setSetup(fresh)
			setSettings({ profile, scraper, 'post-processing': processing })
		} catch (error) {
			notify(`Não consegui conferir o que já está pronto: ${(error as Error).message}`, 'error')
		}
	}

	function goTo(next: OnboardingStep) {
		void navigate({ to: '/boas-vindas', search: { passo: next } })
	}

	const go = (delta: 1 | -1) => () => goTo(ONBOARDING_STEPS[index + delta] ?? 'revisao')
	const afterSave = (delta: 1 | -1) => async () => {
		await refresh()
		go(delta)()
	}

	const numbered = NUMBERED_STEPS.findIndex(item => item.step === step)
	const eyebrow = `passo ${numbered + 1} de ${TOTAL}`

	function renderStep() {
		switch (step) {
			case 'inicio':
				return <Welcome onStart={go(1)} />
			case 'area':
				return (
					<ProfileStep
						eyebrow={eyebrow}
						initial={settings}
						part={part ?? defaultProfilePart(settings.profile)}
						searchDone={setup.steps.profile}
						onPart={next => void navigate({ to: '/boas-vindas', search: { passo: 'area', parte: next } })}
						onBack={go(-1)}
						onDone={afterSave(1)}
					/>
				)
			case 'linkedin':
				return (
					<LinkedinStep
						eyebrow={eyebrow}
						credentials={credentials}
						onCredentials={next => {
							setCredentials(next)
							void refresh()
						}}
						onBack={go(-1)}
						onNext={go(1)}
					/>
				)
			case 'curriculo':
				return (
					<CvStep
						eyebrow={eyebrow}
						initialVersions={initial.cvVersions}
						fromFile={setup.steps.cv}
						onBack={go(-1)}
						onNext={afterSave(1)}
					/>
				)
			case 'extras':
				return (
					<ExtrasStep
						eyebrow={eyebrow}
						credentials={credentials}
						onCredentials={next => {
							setCredentials(next)
							void refresh()
						}}
						onBack={go(-1)}
						onNext={afterSave(1)}
					/>
				)
			case 'revisao':
				return (
					<ReviewStep
						eyebrow={eyebrow}
						setup={setup}
						settings={settings}
						credentials={credentials}
						onBack={go(-1)}
						onGoTo={goTo}
					/>
				)
		}
	}

	return (
		<div className="relative flex min-h-dvh flex-col">
			<header className="flex flex-col items-center gap-3 px-8 pt-6 lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:border-b max-lg:border-line max-lg:bg-bg/88 max-lg:px-4 max-lg:py-3 max-lg:backdrop-blur-md">
				{/* No celular, o topo é uma barra presa: o logo menor */}
				<p className="flex min-h-9.5 items-center">
					<Logo size="lg" className="max-lg:hidden" />
					<Logo size="md" className="lg:hidden" />
				</p>
				<IconButton
					label="Alternar tema claro/escuro"
					bordered
					className="absolute top-6 right-8 max-lg:top-3 max-lg:right-4"
					onClick={toggleTheme}
				>
					<Icon name="moon" className="dark:hidden" />
					<Icon name="sun" className="hidden dark:block" />
				</IconButton>
				{/* Sem espaço para as etapas ao lado do formulário: a barra de progresso no lugar delas */}
				{numbered >= 0 && (
					<div className="flex w-full max-w-240 flex-col gap-1.5 lg:hidden">
						<p className="font-mono text-xs text-muted">
							{eyebrow} · {NUMBERED_STEPS[numbered]!.label}
						</p>
						<div className="h-1.5 overflow-hidden rounded-pill bg-surface-2">
							<div
								className="h-full origin-left rounded-pill bg-lime-accent transition-transform duration-700 ease-glide motion-reduce:transition-none"
								style={{ transform: `scaleX(${(numbered + 1) / TOTAL})` }}
							/>
						</div>
					</div>
				)}
			</header>

			{/* O formulário e as etapas, juntos no meio da tela, na horizontal e na vertical (o logo fica sobreposto, em cima) */}
			<div className="flex grow items-center justify-center gap-16 px-8 py-24 max-lg:py-12 max-md:px-4 max-md:pt-6 max-md:pb-6">
				{/* Na abertura, mais larga: a demonstração ao lado não aperta o título */}
				<main id="main" className={cx('w-full min-w-0', numbered >= 0 ? 'max-w-240' : 'max-w-280')}>
					<div
						key={step}
						className={cx(direction === 'next' ? 'animate-step-next' : 'animate-step-back', 'motion-reduce:animate-none')}
					>
						{renderStep()}
					</div>
					{/* Fora do passo que entra animado: os botões ficam no lugar e só o texto troca */}
					<StepBar />
				</main>

				{/* Na abertura, os passos já estão nos cartões dela: a lista só aparece depois de começar */}
				{numbered >= 0 && (
					<aside className="flex w-48 shrink-0 flex-col gap-8 max-lg:hidden">
						<Stepper current={step} setup={setup} onSelect={goTo} />
						<p className="text-xs text-muted">Pode parar quando quiser: a gente volta para o passo em que você parou.</p>
					</aside>
				)}
			</div>
		</div>
	)
}

/** A lista dos passos, à direita do formulário: o atual em destaque, os feitos com o check; clicar leva ao passo. */
function Stepper({
	current,
	setup,
	onSelect,
}: {
	current: OnboardingStep
	setup: SetupStatus
	onSelect: (step: OnboardingStep) => void
}) {
	const currentIndex = NUMBERED_STEPS.findIndex(item => item.step === current)
	const subSteps = useCurrentSubSteps()

	return (
		<nav aria-label="Passos do onboarding">
			<ol className="m-0 flex list-none flex-col p-0">
				{NUMBERED_STEPS.map((item, index) => {
					const done = stepDone(item.step, setup)
					const isCurrent = item.step === current
					const last = index === NUMBERED_STEPS.length - 1

					return (
						<li
							key={item.step}
							className={cx('relative flex flex-col animate-step-back motion-reduce:animate-none', STEPPER_STAGGER[index])}
						>
							{/* A linha até o próximo passo, que acende ao passar dele */}
							{!last && (
								<span aria-hidden="true" className="absolute top-9 bottom-1 left-4 w-px bg-line">
									<span
										className={cx(
											'block h-full origin-top bg-ink transition-transform duration-700 ease-glide motion-reduce:transition-none',
											index < currentIndex ? 'scale-y-100' : 'scale-y-0',
										)}
									/>
								</span>
							)}
							<button
								type="button"
								onClick={() => onSelect(item.step)}
								aria-current={isCurrent ? 'step' : undefined}
								className="group flex items-center gap-4 rounded-md py-2.5 text-left"
							>
								<span
									className={cx(
										'grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs transition duration-500 ease-spring',
										isCurrent
											? 'border-ink bg-ink text-bg'
											: done
												? 'border-line text-lime-text'
												: 'border-line text-muted group-hover:border-ink group-hover:text-ink',
									)}
								>
									{done && !isCurrent ? (
										<Icon name="check" size={14} className="animate-pop motion-reduce:animate-none" />
									) : (
										index + 1
									)}
								</span>
								<span
									className={cx(
										'text-sm transition',
										isCurrent ? 'font-semibold text-ink' : 'text-muted group-hover:text-ink',
									)}
								>
									{item.label}
								</span>
							</button>
							{isCurrent && subSteps && <SubStepList {...subSteps} />}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}

const STEPPER_STAGGER = ['stagger-2', 'stagger-3', 'stagger-4', 'stagger-5', 'stagger-6']

/** As sub-etapas do passo atual, recuadas embaixo dele: a da tela em destaque, as feitas com o check. */
function SubStepList({ items, current }: SubStepsState) {
	return (
		<ol className="m-0 mb-1 flex list-none flex-col p-0 pl-8">
			{items.map((item, index) => {
				const isCurrent = index === current
				const content = (
					<>
						<span className="grid size-3.5 shrink-0 place-items-center">
							{item.done && !isCurrent ? (
								<Icon name="check" size={12} className="text-lime-text" />
							) : (
								<span className={cx('size-1.5 rounded-full transition', isCurrent ? 'bg-ink' : 'bg-line-strong')} />
							)}
						</span>
						{item.label}
					</>
				)
				const classes = cx(
					'flex items-center gap-2 py-1 text-left text-sm transition',
					isCurrent ? 'font-medium text-ink' : 'text-muted',
				)

				return (
					<li key={item.label} className={cx('animate-step-next motion-reduce:animate-none', SUB_STAGGER[index])}>
						{item.onSelect && !isCurrent ? (
							<button type="button" className={cx(classes, 'hover:text-ink')} onClick={item.onSelect}>
								{content}
							</button>
						) : (
							<span className={classes} aria-current={isCurrent ? 'step' : undefined}>
								{content}
							</span>
						)}
					</li>
				)
			})}
		</ol>
	)
}

const SUB_STAGGER = ['stagger-0', 'stagger-1', 'stagger-2']

const WELCOME_ITEMS = [
	{ title: 'Conte a sua área', text: 'A gente sugere o que buscar no LinkedIn.' },
	{ title: 'Conecte o LinkedIn', text: 'Para ler os posts com vagas por você.' },
	{ title: 'Monte o seu currículo', text: 'Ele vira um currículo ajustado para cada vaga.' },
]

/**
 * A abertura: o que o onboarding vai pedir, em três linhas que chegam pelo lado, e o "começar". Ao lado (só no desktop),
 * a demonstração do que a pessoa ganha: um post que vira vaga.
 */
function Welcome({ onStart }: { onStart: () => void }) {
	useStepBar({ hint: 'leva uns 5 minutos, e dá para parar e continuar depois', primary: { label: 'começar', trailingIcon: 'back', onClick: onStart } })

	return (
		<div className="flex items-center gap-30 md:pt-8">
		<div className="flex min-w-0 flex-1 flex-col gap-10">
			<div className="flex flex-col gap-4">
				<Rise>
					<p className="font-mono text-sm text-lime-text">oi! que bom ter você aqui_</p>
				</Rise>
				<Rise order={1}>
					<h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl">
						Vamos achar vagas <span className="font-mono font-normal">para você.</span>
					</h1>
				</Rise>
				<Rise order={2}>
					<p className="max-w-130 text-lg text-pretty text-muted">
						Em poucos passos você conta o que procura e a gente passa a buscar vagas no LinkedIn sozinho, todos os dias.
					</p>
				</Rise>
			</div>

			<ol className="m-0 flex list-none flex-col gap-3 p-0">
				{WELCOME_ITEMS.map((item, index) => (
					<li
						key={item.title}
						className={cx(
							'flex items-center gap-4 rounded-lg border border-line bg-surface px-5 py-4 animate-step-back motion-reduce:animate-none',
							WELCOME_STAGGER[index],
						)}
					>
						<span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime font-mono text-sm font-semibold text-lime-ink">
							{index + 1}
						</span>
						<span>
							<span className="block font-semibold">{item.title}</span>
							<span className="block text-sm text-muted">{item.text}</span>
						</span>
					</li>
				))}
			</ol>
			<p className="-mt-4 animate-rise-in text-sm text-muted motion-reduce:animate-none stagger-6">
				Dá para mudar tudo depois, nas configurações.
			</p>
		</div>
		<div className="w-80 shrink-0 max-lg:hidden">
			<WelcomeDemo />
		</div>
		</div>
	)
}

const WELCOME_STAGGER = ['stagger-3', 'stagger-4', 'stagger-5']
