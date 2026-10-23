import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import type { SetupStatus, WebCredentials, WebSettings } from '../../../api-types'
import { api } from '../../api'
import { cx } from '../../lib/cx'
import { loadSetup } from '../../stores/setup'
import { notify } from '../../stores/toast'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { FieldHelp } from '../ui/Field'
import { Rise, StepActions, StepHeading } from './parts'
import type { OnboardingStep } from './steps'

type Row = { step: OnboardingStep; title: string; detail: string; done: boolean; optional?: boolean }

/** Passo 5: o resumo do que foi configurado, com "mudar" em cada linha, e a primeira coleta. */
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
	const [starting, setStarting] = useState(false)
	const terms = settings.scraper.searchTerms.filter(term => term.enabled).map(term => term.term)

	const rows: Row[] = [
		{
			step: 'area',
			title: 'Área e busca',
			detail: setup.steps.profile
				? `${settings.profile.targetRole} · ${terms.length} ${terms.length === 1 ? 'busca' : 'buscas'}: ${terms.join(', ')}`
				: 'Falta a área, a vaga que você quer ou o que buscar.',
			done: setup.steps.profile,
		},
		{
			step: 'linkedin',
			title: 'LinkedIn',
			detail: setup.steps.linkedin ? (credentials.linkedin.values.email ?? 'conta do .env') : 'Falta conectar a sua conta.',
			done: setup.steps.linkedin,
		},
		{
			step: 'curriculo',
			title: 'Currículo',
			detail: setup.steps.cv ? 'Pronto para gerar os currículos ajustados.' : 'Falta o seu currículo.',
			done: setup.steps.cv,
		},
		{
			step: 'extras',
			title: 'Discord',
			detail: setup.steps.discord ? 'As vagas também vão para o seu canal.' : 'Não configurado: as vagas ficam só no site.',
			done: setup.steps.discord,
			optional: true,
		},
		{
			step: 'extras',
			title: 'GitHub',
			detail: setup.steps.github ? `Projetos de ${credentials.github.values.username ?? 'você'}.` : 'Não configurado.',
			done: setup.steps.github,
			optional: true,
		},
	]

	async function firstRun() {
		setStarting(true)
		try {
			await api.runNow()
			// O site para de levar ao onboarding a partir daqui
			await loadSetup({ fresh: true })
			notify('Primeira coleta pedida! As vagas aparecem conforme a IA lê os posts.')
			await navigate({ to: '/coletas' })
		} catch (error) {
			notify(`Não consegui começar a coleta: ${(error as Error).message}`, 'error')
			setStarting(false)
		}
	}

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					setup.ready ? (
						<>
							Tudo <span className="font-mono font-normal">pronto!</span>
						</>
					) : (
						'Quase lá'
					)
				}
				lead={
					setup.ready
						? 'Confira o resumo. Quando quiser, a gente faz a primeira busca de vagas. Depois, ela se repete sozinha.'
						: 'Ainda falta alguma coisa obrigatória. Toque em “resolver” para voltar ao passo.'
				}
			/>

			<Rise order={3}>
				<ul className={card({ className: 'm-0 flex list-none flex-col p-0' })}>
					{rows.map((row, index) => (
						<li
							key={row.title}
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
								{row.done || row.optional ? 'mudar' : 'resolver'}
							</Button>
						</li>
					))}
				</ul>
			</Rise>

			<StepActions onBack={onBack}>
				<Button variant="lime" size="lg" disabled={!setup.ready || starting} onClick={firstRun}>
					{starting ? 'começando…' : 'fazer a primeira coleta'}
				</Button>
			</StepActions>
		</div>
	)
}

// As linhas chegam uma depois da outra, depois do título
const ROW_STAGGER = ['stagger-4', 'stagger-5', 'stagger-6', 'stagger-7', 'stagger-8']
