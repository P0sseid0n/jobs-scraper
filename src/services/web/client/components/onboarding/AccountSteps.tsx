import { useState } from 'react'

import type { CredentialGroup, WebCredentials } from '../../../api-types'
import { AccountGroup } from '../AccountsSection'
import { Icon } from '../Icon'
import { LinkedinLoginStatus, useLinkedinLogin } from '../LinkedinLogin'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { card } from '../ui/Card'
import { FieldHelp } from '../ui/Field'
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
	const login = useLinkedinLogin()
	const saved = credentials.linkedin.source !== null

	useStepBar({ onBack, primary: { label: 'continuar', disabled: !saved, onClick: onNext } })

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title="Conecte o seu LinkedIn"
				lead="A gente usa a sua conta para ler os posts com vagas, como se fosse você rolando o feed. A senha fica guardada só nesta máquina, no banco local."
			/>

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
						{login.active ? 'testando…' : 'testar login'}
					</Button>
					<FieldHelp>
						{saved
							? 'Ao salvar, a gente já testa. Se o LinkedIn pedir uma confirmação, ela abre numa janela.'
							: 'Depois de salvar, a gente entra no LinkedIn para conferir.'}
					</FieldHelp>
				</div>
				<LinkedinLoginStatus login={login} />
			</Rise>
		</div>
	)
}

const EXTRAS: { group: Exclude<CredentialGroup, 'linkedin'>; title: string; description: string }[] = [
	{
		group: 'discord',
		title: 'Receber as vagas no Discord',
		description:
			'Um bot manda cada vaga nova num canal seu, com o botão para gerar o currículo. Sem ele, as vagas ficam só aqui no site.',
	},
	{
		group: 'github',
		title: 'Mostrar seus projetos do GitHub',
		description: 'A gente escolhe os seus projetos mais parecidos com cada vaga para pôr no currículo. Bom para quem programa.',
	},
]

/** Passo 4: Discord e GitHub, os dois opcionais; cada um abre o formulário da conta, e dá para pular. */
export function ExtrasStep({ eyebrow, credentials, onCredentials, onBack, onNext }: AccountStepProps) {
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
		primary: { label: anySaved ? 'continuar' : 'pular por agora', variant: anySaved ? 'lime' : 'ghost', onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					<>
						Quer ir <span className="font-mono font-normal">além?</span>
					</>
				}
				lead="Estas duas são opcionais. Dá para configurar agora ou mais tarde, em Configurações › Contas."
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
										{extra.title}
										<Badge tone={done ? 'ok' : 'muted'}>{done ? 'pronto' : 'opcional'}</Badge>
									</h2>
									<FieldHelp>{extra.description}</FieldHelp>
								</div>
								<Button
									variant="ghost"
									size="sm"
									aria-expanded={expanded}
									onClick={() => setOpen(expanded ? null : extra.group)}
								>
									<Icon name="chevron" className={expanded ? 'rotate-180 transition' : 'transition'} />
									{expanded ? 'fechar' : done ? 'mudar' : 'configurar'}
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
	const saved = credentials.smtp.source !== null

	useStepBar({
		onBack,
		primary: { label: saved ? 'continuar' : 'pular por agora', variant: saved ? 'lime' : 'ghost', onClick: onNext },
	})

	return (
		<div className="flex flex-col gap-9">
			<StepHeading
				eyebrow={eyebrow}
				title={
					<>
						Enviar a candidatura <span className="font-mono font-normal">daqui</span>
					</>
				}
				lead="Com a sua conta de e-mail, o botão “enviar candidatura” manda a mensagem revisada e o currículo da vaga em anexo para o recrutador, sempre depois de você confirmar. É opcional: sem ela, você copia a mensagem e envia pelo seu e-mail."
			/>

			<Rise order={3} className={card({ size: 'lg', className: 'flex flex-col gap-5' })}>
				<AccountGroup group="smtp" status={credentials} compact onSaved={onCredentials} />
			</Rise>

			<Rise order={4}>
				<FieldHelp>
					No Gmail: servidor smtp.gmail.com e uma senha de app (Conta Google › Segurança › Senhas de app). No Outlook:
					smtp.office365.com. O “testar” entra no servidor sem enviar nada.
				</FieldHelp>
			</Rise>
		</div>
	)
}
