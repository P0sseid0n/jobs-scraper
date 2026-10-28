import { useEffect, useState } from 'react'

import type { CredentialCheck, CredentialGroup, WebCredentials } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import { shakeInvalid } from '../lib/motion'
import { useFlash } from '../lib/use-flash'
import { notify } from '../stores/toast'
import { DrawnCheck, Icon } from './Icon'
import { LinkedinLoginStatus, useLinkedinLogin } from './LinkedinLogin'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { card } from './ui/Card'
import { ConfirmDialog } from './ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { TabPanel, Tabs } from './ui/Tabs'
import { SECTION_TITLE } from './ui/text'

type FieldDef = {
	name: string
	label: string
	/** Segredo: o valor salvo nunca chega ao site, o campo começa vazio e vazio mantém o salvo. */
	secret?: boolean
	/** Segredo que pode ser removido (ex.: o token do GitHub). */
	optional?: boolean
	placeholder?: string
	help?: string
	type?: 'email'
	inputMode?: 'numeric'
}

type GroupDef = {
	title: string
	/** Como a conta é chamada nos avisos; sem ele, "conta do <título>". */
	account?: string
	note: string
	/** O que fica parado enquanto a conta não está configurada; sem ele, a conta é opcional. */
	missing?: string
	/** Testada pela API das credenciais (o LinkedIn tem o teste próprio, `LinkedinLogin`). */
	testable: boolean
	fields: FieldDef[]
}

const GROUPS: Record<CredentialGroup, GroupDef> = {
	linkedin: {
		title: 'LinkedIn',
		note: 'Usada pelo scraper a partir da próxima coleta. O teste faz o login de verdade e guarda a sessão para as coletas.',
		missing: 'Sem ela, o scraper fica em espera e não coleta posts. A coleta começa sozinha depois de salvar.',
		testable: false,
		fields: [
			{ name: 'email', label: 'e-mail', type: 'email', placeholder: 'voce@exemplo.com' },
			{ name: 'password', label: 'senha', secret: true },
			{
				name: 'liAt',
				label: 'cookie li_at',
				secret: true,
				optional: true,
				help: 'Opcional: o cookie de uma sessão já logada, usado enquanto o scraper não tem uma salva.',
			},
		],
	},
	discord: {
		title: 'Discord',
		note: 'O bot reconecta sozinho em até 30 s depois de salvar.',
		missing: 'Sem ele, as vagas ficam só no site: não são publicadas no Discord, nem depois de configurar.',
		testable: true,
		fields: [
			{ name: 'token', label: 'token do bot', secret: true },
			{
				name: 'channelId',
				label: 'ID do canal',
				inputMode: 'numeric',
				placeholder: 'ex.: 123456789012345678',
				help: 'Canal de texto ou de fórum. Com o modo desenvolvedor ligado: botão direito no canal › Copiar ID.',
			},
		],
	},
	github: {
		title: 'GitHub',
		note: 'Usado a partir do próximo currículo, para escolher os seus projetos mais próximos da vaga.',
		testable: true,
		fields: [
			{ name: 'username', label: 'usuário', placeholder: 'ex.: octocat' },
			{
				name: 'token',
				label: 'token',
				secret: true,
				optional: true,
				help: 'Opcional: sem token, a API do GitHub permite só 60 requisições por hora.',
			},
		],
	},
	smtp: {
		title: 'E-mail',
		account: 'conta de e-mail',
		note: 'Usada pelo mailer para enviar as candidaturas, pelo site e pelo Discord, sempre depois da sua confirmação. O teste faz o login sem enviar nada.',
		testable: true,
		fields: [
			{ name: 'host', label: 'servidor SMTP', placeholder: 'ex.: smtp.gmail.com' },
			{
				name: 'port',
				label: 'porta',
				inputMode: 'numeric',
				placeholder: '587',
				help: 'Opcional: 587 (STARTTLS) por padrão; use 465 para TLS direto.',
			},
			{ name: 'user', label: 'usuário', type: 'email', placeholder: 'voce@gmail.com' },
			{
				name: 'password',
				label: 'senha de app',
				secret: true,
				help: 'No Gmail e no Outlook, crie uma senha de app (com a verificação em duas etapas ligada); a senha normal é recusada.',
			},
			{
				name: 'from',
				label: 'remetente',
				placeholder: 'ex.: Ana Souza <voce@gmail.com>',
				help: 'Opcional: o nome e o e-mail que o recrutador vê. Vazio usa o usuário.',
			},
		],
	},
}

const SOURCE_BADGES = {
	database: { tone: 'ok', label: 'salva no site' },
	env: {
		tone: 'neutral',
		label: 'usando o .env',
		title: 'Nada salvo no site: valem as credenciais do arquivo .env. Salvar aqui passa a valer no lugar delas.',
	},
	none: { tone: 'muted', label: 'não configurada' },
} as const

const GROUP_KEYS = Object.keys(GROUPS) as CredentialGroup[]
const TABS = GROUP_KEYS.map(group => ({ value: group, label: GROUPS[group].title }))

/**
 * As contas do LinkedIn, do Discord, do GitHub e do e-mail (SMTP), uma por aba. Cada uma é salva à parte, no MongoDB local, e vale no
 * lugar do `.env`; os segredos salvos nunca chegam ao navegador.
 */
export function AccountsSection({
	initial,
	onDirtyChange,
	className,
	...props
}: {
	initial: WebCredentials
	/** As contas com alterações não salvas ("conta do LinkedIn"; cada uma tem o próprio salvar), na ordem das abas. */
	onDirtyChange?: (accounts: string[]) => void
	className?: string
	id?: string
}) {
	const [status, setStatus] = useState(initial)
	const [selected, setSelected] = useState<CredentialGroup>('linkedin')
	const [dirtyGroups, setDirtyGroups] = useState<CredentialGroup[]>([])

	useEffect(() => onDirtyChange?.(dirtyGroups.map(accountNameOf)), [dirtyGroups])

	function setGroupDirty(group: CredentialGroup, dirty: boolean) {
		setDirtyGroups(current =>
			dirty === current.includes(group) ? current : GROUP_KEYS.filter(key => (key === group ? dirty : current.includes(key))),
		)
	}

	return (
		<section
			{...props}
			className={card({ size: 'lg', className: cx('flex flex-col gap-6.5', className) })}
			aria-labelledby="accounts-title"
		>
			<div className="flex flex-col gap-1.5">
				<h2 id="accounts-title" className={SECTION_TITLE}>
					contas <span className="font-mono text-xs font-normal text-muted">credenciais</span>
				</h2>
				<FieldHelp>
					Ficam no MongoDB desta máquina e valem no lugar das do <code className="font-mono">.env</code>. Os segredos salvos não
					são mostrados: deixe o campo vazio para manter o atual.
				</FieldHelp>
			</div>

			<div className="flex flex-col gap-6">
				<Tabs id="accounts" label="Contas" items={TABS} selected={selected} onSelect={setSelected} />

				{GROUP_KEYS.map(group => (
					<TabPanel key={group} tabsId="accounts" value={group} selected={group === selected} className="flex flex-col gap-4">
						<AccountGroup
							group={group}
							status={status}
							onSaved={setStatus}
							onDirtyChange={dirty => setGroupDirty(group, dirty)}
						/>
						{group === 'linkedin' && <LinkedinLoginTest configured={status.linkedin.source !== null} />}
					</TabPanel>
				))}
			</div>
		</section>
	)
}

/** Como a conta é chamada nos avisos ("conta do LinkedIn", "conta de e-mail"). */
function accountNameOf(group: CredentialGroup) {
	return GROUPS[group].account ?? `conta do ${GROUPS[group].title}`
}

function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Os campos de um grupo como estão salvos: os públicos com o valor e os segredos vazios. */
function draftOf(group: CredentialGroup, status: WebCredentials) {
	const values: Record<string, string | null> = status[group].values
	return Object.fromEntries(GROUPS[group].fields.map(field => [field.name, field.secret ? '' : (values[field.name] ?? '')]))
}

/** O teste do login do LinkedIn, com a conta salva. */
function LinkedinLoginTest({ configured }: { configured: boolean }) {
	const login = useLinkedinLogin()

	return (
		<div className="flex flex-col gap-3 border-t border-line pt-4">
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="ghost" disabled={!configured || login.active} onClick={login.start}>
					{login.active ? 'testando…' : 'testar login'}
				</Button>
				<FieldHelp>Se o LinkedIn pedir uma verificação, ela abre numa janela.</FieldHelp>
			</div>
			<LinkedinLoginStatus login={login} />
		</div>
	)
}

/**
 * Os campos de uma conta, com salvar, testar e apagar. Com `compact` (no onboarding), sem a nota, o selo de origem e o
 * aviso do que fica parado: a tela em volta já explica.
 */
export function AccountGroup({
	group,
	status,
	onSaved,
	onDirtyChange,
	compact = false,
}: {
	group: CredentialGroup
	status: WebCredentials
	onSaved: (status: WebCredentials) => void
	/** Avisa quando a conta passa a ter (ou deixa de ter) alterações não salvas. */
	onDirtyChange?: (dirty: boolean) => void
	compact?: boolean
}) {
	const config = GROUPS[group]
	const accountName = accountNameOf(group)
	const current = status[group]
	const secrets: Record<string, boolean> = current.secrets

	const [draft, setDraft] = useState(() => draftOf(group, status))
	const [removed, setRemoved] = useState<string[]>([])
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState<'save' | 'test' | 'delete' | null>(null)
	const [check, setCheck] = useState<CredentialCheck | null>(null)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [savedFlash, flashSaved] = useFlash()

	const saved = draftOf(group, status)
	const dirty = removed.length > 0 || config.fields.some(field => draft[field.name] !== saved[field.name])
	useEffect(() => onDirtyChange?.(dirty), [dirty])

	/** Só o que mudou: segredos vazios mantêm o salvo; os removidos vão como texto vazio. */
	function patch() {
		const changed = config.fields.filter(field => draft[field.name] !== saved[field.name])
		return {
			...Object.fromEntries(changed.map(field => [field.name, draft[field.name] ?? ''])),
			...Object.fromEntries(removed.map(name => [name, ''])),
		}
	}

	function reset(next: WebCredentials) {
		setDraft(draftOf(group, next))
		setRemoved([])
		setErrors({})
	}

	async function run(action: 'save' | 'test' | 'delete') {
		setBusy(action)
		setErrors({})
		if (action !== 'test') setCheck(null)

		try {
			if (action === 'test') {
				setCheck(await api.testCredentials(group, patch()))
			} else {
				const next = action === 'save' ? await api.saveCredentials(group, patch()) : await api.deleteCredentials(group)
				onSaved(next)
				reset(next)
				if (action === 'save') flashSaved()
				notify(action === 'save' ? `${capitalize(accountName)} salva` : `${capitalize(accountName)} apagada do site`)
			}
		} catch (error) {
			setErrors(error instanceof RequestError ? error.fields : {})
			shakeInvalid(() => document.getElementById('main'))
			if (action === 'test') setCheck(null)
			if (!(error instanceof RequestError && Object.keys(error.fields).length > 0)) {
				notify(
					`Não consegui ${action === 'save' ? 'salvar' : action === 'test' ? 'testar' : 'apagar'}: ${(error as Error).message}`,
					'error',
				)
			}
		} finally {
			setBusy(null)
		}
	}

	const badge = SOURCE_BADGES[current.source ?? 'none']

	return (
		<>
			{confirmDelete && (
				<ConfirmDialog
					title={`Apagar a ${accountName}?`}
					description="As credenciais salvas no site são apagadas. Se o .env tiver as dele, elas voltam a valer."
					confirmLabel="apagar"
					cancelLabel="cancelar"
					onConfirm={() => {
						setConfirmDelete(false)
						run('delete')
					}}
					onCancel={() => setConfirmDelete(false)}
				/>
			)}

			{!compact && (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<FieldHelp>{config.note}</FieldHelp>
					<Badge tone={badge.tone} title={'title' in badge ? badge.title : undefined}>
						{badge.label}
					</Badge>
				</div>
			)}

			{!compact && current.source === null && config.missing && (
				<Notice tone="warn" icon="alert">
					<p className="text-sm">{config.missing}</p>
				</Notice>
			)}

			<div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
				{config.fields.map(field => {
					const id = `${group}-${field.name}`
					const isRemoved = removed.includes(field.name)
					const hasSaved = field.secret && secrets[field.name]
					const help = isRemoved ? 'Será removido ao salvar.' : field.help

					return (
						<div key={field.name} className="flex flex-col gap-1.5">
							<FieldLabel htmlFor={id}>{field.label}</FieldLabel>
							<div className="flex items-center gap-2.5">
								<Input
									id={id}
									className={cx('grow', field.secret && 'font-mono')}
									type={field.secret ? 'password' : (field.type ?? 'text')}
									inputMode={field.inputMode}
									autoComplete={field.secret ? 'new-password' : 'off'}
									spellCheck={false}
									value={draft[field.name] ?? ''}
									disabled={isRemoved}
									placeholder={
										hasSaved ? '•••••••• salvo · vazio mantém' : (field.placeholder ?? (field.optional ? 'opcional' : ''))
									}
									invalid={!!errors[field.name]}
									aria-describedby={errors[field.name] ? `${id}-error` : help ? `${id}-help` : undefined}
									onChange={event => {
										const value = event.target.value
										setDraft(current => ({ ...current, [field.name]: value }))
										setErrors(current => ({ ...current, [field.name]: '' }))
										setCheck(null)
									}}
								/>
								{field.optional && hasSaved && (
									<IconButton
										label={isRemoved ? `Manter o ${field.label} salvo` : `Remover o ${field.label} salvo`}
										bordered
										onClick={() => {
											setRemoved(current =>
												isRemoved ? current.filter(name => name !== field.name) : [...current, field.name],
											)
											setDraft(current => ({ ...current, [field.name]: '' }))
										}}
									>
										<Icon name={isRemoved ? 'back' : 'trash'} />
									</IconButton>
								)}
							</div>
							{errors[field.name] ? (
								<FieldError id={`${id}-error`}>{errors[field.name]}</FieldError>
							) : (
								help && <FieldHelp id={`${id}-help`}>{help}</FieldHelp>
							)}
						</div>
					)
				})}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				{/* Salvo, o check desenhado aparece no botão por um instante */}
				<Button
					variant="lime"
					disabled={(!dirty && !savedFlash) || busy !== null}
					onClick={savedFlash ? undefined : () => run('save')}
				>
					{busy === 'save' ? (
						<>
							<Icon name="spinner" />
							salvando…
						</>
					) : savedFlash ? (
						<>
							<DrawnCheck />
							salvo
						</>
					) : (
						'salvar'
					)}
				</Button>
				{config.testable && (
					<Button variant="ghost" disabled={busy !== null || (current.source === null && !dirty)} onClick={() => run('test')}>
						{busy === 'test' ? 'testando…' : 'testar'}
					</Button>
				)}
				{current.source === 'database' && (
					<Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
						apagar do site
					</Button>
				)}
				{dirty && (
					<Button variant="ghost" disabled={busy !== null} onClick={() => reset(status)}>
						descartar
					</Button>
				)}
			</div>

			<div role="status" className="empty:hidden">
				{check && (
					<p className={cx('flex items-center gap-2 text-sm', check.ok ? 'text-ok' : 'text-danger')}>
						<Icon name={check.ok ? 'check' : 'alert'} />
						{check.message}
					</p>
				)}
			</div>
		</>
	)
}
