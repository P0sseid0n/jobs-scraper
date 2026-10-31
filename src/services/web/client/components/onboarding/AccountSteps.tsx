import { useState } from 'react'

import type { CredentialGroup, WebCredentials } from '../../../api-types'
import { useT } from '../../stores/locale'
import { AccountGroup } from '../AccountsSection'
import { Icon } from '../Icon'
import { LinkedinLoginStatus, useLinkedinLogin } from '../LinkedinLogin'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { FieldHelp } from '../ui/Field'
import { Hero } from '../ui/Page'
import { Rise, StepHeading, useStepBar, useSubSteps } from './parts'

type AccountStepProps = {
	eyebrow: string
	credentials: WebCredentials
	onCredentials: (credentials: WebCredentials) => void
	onBack: () => void
	onNext: () => void
}

/**
 * Passo 2: a conta do LinkedIn. Ao salvar, o login é testado na hora; se o LinkedIn pedir uma verificação (QR code,
 * código ou aprovação no app), ela aparece aqui.
 */
export function LinkedinStep({ eyebrow, credentials, onCredentials, onBack, onNext }: AccountStepProps) {
	const t = useT()
	const login = useLinkedinLogin()
	const saved = credentials.linkedin.source !== null

	useStepBar({ onBack, primary: { label: t.actions.continue, disabled: !saved, onClick: onNext } })

	return (
		<div className="flex flex-col gap-9">
			<StepHeading eyebrow={eyebrow} title={t.accountSteps.linkedinTitle} lead={t.accountSteps.linkedinLead} />

			<Rise order={3} className={card({ size: 'lg', className: 'flex flex-col gap-5' })}>
				<AccountGroup
					group="linkedin"
					status={credentials}
					compact
					onSaved={next => {
						onCredentials(next)
						// Apagar a conta do site também chega aqui: só testa se ainda há uma
						if (next.linkedin.source !== null) void login.start()
					}}
				/>
			</Rise>

			<Rise order={4} className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<Button variant="ghost" disabled={!saved || login.active} onClick={login.start}>
						{login.active ? t.accountSteps.testing : t.accountSteps.testLogin}
					</Button>
					<FieldHelp>{saved ? t.accountSteps.testOnSave : t.accountSteps.testAfterSave}</FieldHelp>
				</div>
				<LinkedinLoginStatus login={login} />
			</Rise>
		</div>
	)
}

/** As contas opcionais do passo, com o título e a descrição de cada uma no catálogo (`accountSteps`). */
const EXTRAS = [
	{ group: 'discord', title: 'discordTitle', description: 'discordDescription' },
	{ group: 'github', title: 'githubTitle', description: 'githubDescription' },
] as const

/** Passo 4: Discord e GitHub, os dois opcionais; cada um abre o formulário da conta, e dá para pular. */
export function ExtrasStep({ eyebrow, credentials, onCredentials, onBack, onNext }: AccountStepProps) {
	const t = useT()
	const [open, setOpen] = useState<CredentialGroup | null>(null)
	const anySaved = EXTRAS.some(extra => credentials[extra.group].source !== null)

	/** Abre a conta e leva até ela (pela lista de etapas). */
	function show(group: CredentialGroup) {
		setOpen(group)
		document.getElementById(`extra-${group}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
	}

	useSubSteps({
		items: EXTRAS.map(extra => ({
			label: extra.group === 'discord' ? 'Discord' : 'GitHub',
			done: credentials[extra.group].source !== null,
			onSelect: () => show(extra.group),
		})),
		current: EXTRAS.findIndex(extra => extra.group === open),
	})

	useStepBar({
		onBack,
		primary: { label: anySaved ? t.actions.continue : t.accountSteps.skip, variant: anySaved ? 'lime' : 'ghost', onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					<>
						{t.accountSteps.extrasTitle} <Hero.Mono>{t.accountSteps.extrasTitleMono}</Hero.Mono>
					</>
				}
				lead={t.accountSteps.extrasLead}
			/>

			<div className="flex flex-col gap-4">
				{EXTRAS.map((extra, index) => {
					const done = credentials[extra.group].source !== null
					const expanded = open === extra.group

					return (
						<Rise
							key={extra.group}
							id={`extra-${extra.group}`}
							order={3 + index}
							className={card({ size: 'md', className: 'flex flex-col gap-4' })}
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="flex max-w-120 flex-col gap-1">
									<h2 className="flex items-center gap-2 text-base font-semibold">
										{t.accountSteps[extra.title]}
										<Badge tone={done ? 'ok' : 'muted'}>{done ? t.accountSteps.ready : t.accountSteps.optional}</Badge>
									</h2>
									<FieldHelp>{t.accountSteps[extra.description]}</FieldHelp>
								</div>
								<Button
									variant="ghost"
									size="sm"
									aria-expanded={expanded}
									onClick={() => setOpen(expanded ? null : extra.group)}
								>
									<Icon name="chevron" className={expanded ? 'rotate-180 transition' : 'transition'} />
									{expanded ? t.accountSteps.close : done ? t.accountSteps.change : t.accountSteps.configure}
								</Button>
							</div>
							{expanded && (
								<div className="flex flex-col gap-4 border-t border-line pt-4 animate-panel-in motion-reduce:animate-none">
									<AccountGroup
										group={extra.group}
										status={credentials}
										compact
										onSaved={next => {
											onCredentials(next)
											setOpen(null)
										}}
									/>
								</div>
							)}
						</Rise>
					)
				})}
			</div>
		</div>
	)
}

/**
 * Passo opcional: a conta de e-mail (SMTP) para enviar as candidaturas daqui e pelo Discord, com o currículo anexado,
 * sempre depois de confirmar. Sem ela, a mensagem continua pronta para copiar.
 */
export function EmailStep({ eyebrow, credentials, onCredentials, onBack, onNext }: AccountStepProps) {
	const t = useT()
	const saved = credentials.smtp.source !== null

	useStepBar({
		onBack,
		primary: { label: saved ? t.actions.continue : t.accountSteps.skip, variant: saved ? 'lime' : 'ghost', onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					<>
						{t.accountSteps.emailTitle} <Hero.Mono>{t.accountSteps.emailTitleMono}</Hero.Mono>
					</>
				}
				lead={t.accountSteps.emailLead}
			/>

			<Rise order={3} className={card({ size: 'lg', className: 'flex flex-col gap-5' })}>
				<AccountGroup group="smtp" status={credentials} compact onSaved={onCredentials} />
			</Rise>
		</div>
	)
}
