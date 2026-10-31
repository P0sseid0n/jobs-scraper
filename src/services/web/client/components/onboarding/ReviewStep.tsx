import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { SetupStatus, WebCredentials, WebSettings } from '../../../api-types'
import { api } from '../../api'
import { cx } from '../../lib/cx'
import { useT } from '../../stores/locale'
import { loadSetup } from '../../stores/setup'
import { notify } from '../../stores/toast'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { FieldHelp } from '../ui/Field'
import { Hero } from '../ui/Page'
import { Rise, StepHeading, useStepBar } from './parts'
import type { OnboardingStep } from './steps'

type Row = { step: OnboardingStep; title: string; detail: string; done: boolean; optional?: boolean }

/** Último passo: o resumo do que foi configurado, com "mudar" em cada linha, e a primeira coleta. */
export function ReviewStep({
	eyebrow,
	setup,
	settings,
	credentials,
	onBack,
	onGoTo,
}: {
	eyebrow: string
	setup: SetupStatus
	settings: Pick<WebSettings, 'profile' | 'scraper'>
	credentials: WebCredentials
	onBack: () => void
	onGoTo: (step: OnboardingStep) => void
}) {
	const navigate = useNavigate()
	const t = useT()
	const review = t.reviewStep
	const [starting, setStarting] = useState(false)
	const terms = settings.scraper.searchTerms.filter(term => term.enabled).map(term => term.term)

	const rows: Row[] = [
		{
			step: 'field',
			title: review.areaTitle,
			detail: setup.steps.profile ? review.areaDetail(settings.profile.targetRole ?? '', terms) : review.areaMissing,
			done: setup.steps.profile,
		},
		{
			step: 'linkedin',
			title: 'LinkedIn',
			detail: setup.steps.linkedin ? (credentials.linkedin.values.email ?? review.linkedinEnv) : review.linkedinMissing,
			done: setup.steps.linkedin,
		},
		{
			step: 'resume',
			title: review.cvTitle,
			detail: setup.steps.cv ? review.cvReady : review.cvMissing,
			done: setup.steps.cv,
		},
		{
			step: 'extras',
			title: 'Discord',
			detail: setup.steps.discord ? review.discordReady : review.discordMissing,
			done: setup.steps.discord,
			optional: true,
		},
		{
			step: 'extras',
			title: 'GitHub',
			detail: setup.steps.github
				? review.githubReady(credentials.github.values.username ?? review.githubYou)
				: review.notConfigured,
			done: setup.steps.github,
			optional: true,
		},
		{
			step: 'email',
			title: review.emailTitle,
			detail: setup.steps.email
				? review.emailReady(credentials.smtp.values.from ?? credentials.smtp.values.user ?? review.emailYourAccount)
				: review.emailMissing,
			done: setup.steps.email,
			optional: true,
		},
	]

	async function firstRun() {
		setStarting(true)
		try {
			await api.runNow()
			// O site para de levar ao onboarding a partir daqui
			await loadSetup({ fresh: true })
			notify(review.firstRunStarted)
			await navigate({ to: '/runs' })
		} catch (error) {
			notify(review.firstRunFailed((error as Error).message), 'error')
			setStarting(false)
		}
	}

	useStepBar({
		onBack,
		primary: { label: starting ? review.starting : review.firstRun, disabled: !setup.ready || starting, onClick: firstRun },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					setup.ready ? (
						<>
							{review.readyTitle} <Hero.Mono>{review.readyTitleMono}</Hero.Mono>
						</>
					) : (
						review.almostTitle
					)
				}
				lead={setup.ready ? review.readyLead : review.almostLead}
			/>

			<Rise order={3}>
				<ul className={card({ className: 'm-0 flex list-none flex-col p-0' })}>
					{rows.map((row, index) => (
						<li
							key={`${row.step}-${index}`}
							className={cx(
								'flex items-center gap-3.5 px-5 py-4 animate-rise-in motion-reduce:animate-none max-md:px-4',
								index > 0 && 'border-t border-line',
								ROW_STAGGER[index],
							)}
						>
							<span
								className={cx(
									'grid size-8 shrink-0 place-items-center rounded-full',
									row.done ? 'bg-lime text-lime-ink' : row.optional ? 'bg-surface-2 text-muted' : 'bg-warn-bg text-warn',
								)}
							>
								<Icon name={row.done ? 'check' : row.optional ? 'plus' : 'alert'} size={14} />
							</span>
							<div className="min-w-0 grow">
								<p className="font-semibold">{row.title}</p>
								<FieldHelp className="truncate">{row.detail}</FieldHelp>
							</div>
							<Button variant="ghost" size="sm" onClick={() => onGoTo(row.step)}>
								{row.done || row.optional ? review.change : review.fix}
							</Button>
						</li>
					))}
				</ul>
			</Rise>
		</div>
	)
}

// As linhas chegam uma depois da outra, depois do título
const ROW_STAGGER = ['stagger-4', 'stagger-5', 'stagger-6', 'stagger-7', 'stagger-8', 'stagger-9']
