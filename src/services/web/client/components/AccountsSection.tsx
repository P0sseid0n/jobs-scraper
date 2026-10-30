import { useEffect, useId, useState } from 'react'

import { isMicrosoftPersonalAccount, smtpHostFor } from '@shared/contracts'

import type { CredentialCheck, CredentialGroup, WebCredentials } from '../../api-types'
import { api, RequestError } from '../api'
import { ACCOUNT_TUTORIALS } from '../lib/account-tutorials'
import { cx } from '../lib/cx'
import { shakeInvalid } from '../lib/motion'
import { GMAIL_PRESET, initialSmtpProvider, SMTP_PROVIDER_OPTIONS, type SmtpProviderChoice } from '../lib/smtp-presets'
import { useStore } from '../lib/store'
import { useFlash } from '../lib/use-flash'
import { accountTutorialOpen, accountTutorialRequest } from '../stores/account-tutorial'
import { notify } from '../stores/toast'
import { accountScene } from './AccountTutorialScenes'
import { DrawnCheck, Icon } from './Icon'
import { LinkedinLoginStatus, useLinkedinLogin } from './LinkedinLogin'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/Dialog'
import { Disclosure } from './ui/Disclosure'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { Pill, PillGroup } from './ui/Pill'
import { SectionCard } from './ui/SectionCard'
import { TabPanel, Tabs } from './ui/Tabs'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'
import { Tutorial, TutorialDialog } from './ui/Tutorial'

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
	/**
	 * Quantos quartos da linha o campo ocupa (padrão: metade). Ex.: o servidor largo com a porta estreita ao lado, ou o
	 * campo sozinho na linha inteira, para não sobrar meia linha vazia. No celular, todos ocupam a linha.
	 */
	span?: keyof typeof FIELD_SPANS
	/** Fica recolhido em "avançado": tem um padrão que serve para quase todo mundo (ex.: o servidor deduzido do e-mail). */
	advanced?: boolean
	/** A ajuda e o placeholder conforme o que foi digitado na conta (ex.: o servidor deduzido do usuário). */
	live?: (values: Record<string, string>) => Pick<FieldDef, 'help' | 'placeholder'>
	/** Ao sair do campo, abre o "avançado" se o valor pedir um campo de lá (ex.: um domínio sem servidor conhecido). */
	revealsAdvanced?: (values: Record<string, string>) => boolean
}

/** A grade dos campos, em quartos da linha (`FieldDef.span`); no celular, uma coluna. */
const FIELD_GRID = 'grid grid-cols-4 gap-5 max-md:grid-cols-1'

const FIELD_SPANS = {
	1: 'col-span-1',
	2: 'col-span-2',
	3: 'col-span-3',
	4: 'col-span-4',
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
	/** O que o teste faz, junto dos botões (como a dica ao lado do "testar login" do LinkedIn). */
	testHelp?: string
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
				help: 'Opcional: o cookie de uma sessão já logada, usado enquanto o scraper não tem uma salva (no primeiro login, por exemplo). Ajuda quando não dá para confirmar o acesso que o LinkedIn pede.',
				span: 4,
				advanced: true,
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
		note: 'Usada pelo mailer para enviar as candidaturas, pelo site e pelo Discord, sempre depois da sua confirmação.',
		testable: true,
		testHelp: 'O teste faz o login sem enviar nada.',
		fields: [
			{
				name: 'user',
				label: 'usuário',
				type: 'email',
				placeholder: 'voce@gmail.com',
				live: values => ({ help: smtpUserHelp(values) }),
				revealsAdvanced: values => needsSmtpHost(values),
			},
			{
				name: 'password',
				label: 'senha de app',
				secret: true,
				help: 'A senha de app do provedor (no Gmail, com a verificação em duas etapas ligada): a senha normal é recusada.',
			},
			{
				name: 'host',
				label: 'servidor SMTP',
				span: 3,
				advanced: true,
				live: values => ({ placeholder: smtpHostFor(values.user ?? '') ?? 'ex.: smtp.empresa.com.br' }),
				help: 'Vazio: deduzido do e-mail do usuário (Gmail, Yahoo e iCloud).',
			},
			{
				name: 'port',
				label: 'porta',
				inputMode: 'numeric',
				placeholder: '587',
				help: 'Opcional: 587 (STARTTLS) por padrão; use 465 para TLS direto.',
				span: 1,
				advanced: true,
			},
			{
				name: 'from',
				label: 'remetente',
				placeholder: 'ex.: Ana Souza <voce@gmail.com>',
				help: 'Opcional: o nome e o e-mail que o recrutador vê. Vazio usa o nome do currículo base (o feito pelo formulário) com o usuário.',
				span: 4,
				advanced: true,
			},
		],
	},
}

/** Um e-mail com domínio, mas sem servidor conhecido nem informado: o servidor precisa ser preenchido em "avançado". */
function needsSmtpHost(values: Record<string, string>) {
	const user = values.user?.trim() ?? ''
	return /@.+\..+/.test(user) && !smtpHostFor(user) && !values.host?.trim()
}

/** Diz, abaixo do usuário, de onde sai o servidor: o deduzido do domínio ou o pedido em "avançado". */
function smtpUserHelp(values: Record<string, string>) {
	// A conta pessoal da Microsoft tem o aviso próprio (`SmtpProviderGuide`)
	if (values.host?.trim() || isMicrosoftPersonalAccount(values)) return undefined

	const host = smtpHostFor(values.user ?? '')
	if (host) return `O servidor (${host}) sai do domínio do e-mail.`
	if (needsSmtpHost(values)) return `Não conheço o servidor de ${values.user?.split('@')[1]}: informe em "avançado".`
	return undefined
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
	initialGroup = 'linkedin',
	onDirtyChange,
	...props
}: {
	initial: WebCredentials
	/** A aba que abre selecionada (o link "configure a conta de e-mail" abre a do e-mail). */
	initialGroup?: CredentialGroup
	/** As contas com alterações não salvas ("conta do LinkedIn"; cada uma tem o próprio salvar), na ordem das abas. */
	onDirtyChange?: (accounts: string[]) => void
	className?: string
	id?: string
}) {
	const [status, setStatus] = useState(initial)
	const [selected, setSelected] = useState<CredentialGroup>(initialGroup)
	// Outro link para a tela já aberta (ex.: de "e-mail" para "LinkedIn") troca a aba
	useEffect(() => setSelected(initialGroup), [initialGroup])
	const [dirtyGroups, setDirtyGroups] = useState<CredentialGroup[]>([])

	useEffect(() => onDirtyChange?.(dirtyGroups.map(accountNameOf)), [dirtyGroups])

	function setGroupDirty(group: CredentialGroup, dirty: boolean) {
		setDirtyGroups(current =>
			dirty === current.includes(group) ? current : GROUP_KEYS.filter(key => (key === group ? dirty : current.includes(key))),
		)
	}

	return (
		<SectionCard
			{...props}
			title="contas"
			tag="credenciais"
			description={
				<>
					Ficam no MongoDB desta máquina e valem no lugar das do <code className="font-mono">.env</code>. Os segredos salvos não
					são mostrados: deixe o campo vazio para manter o atual.
				</>
			}
		>
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
		</SectionCard>
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
 * Os campos de uma conta, com salvar, testar e apagar, e o tutorial da conta: numa modal, pelo "como configurar". Com
 * `compact` (no onboarding), sem a nota, o selo de origem e o aviso do que fica parado (a tela em volta já explica), e o
 * tutorial já aberto ao lado dos campos (acima deles no celular), até a pessoa fechar.
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
	// O tutorial: na modal (`dialog`, com o passo em destaque) ou, no onboarding, ao lado dos campos
	const [dialog, setDialog] = useState<{ step?: string } | null>(null)
	const [highlight, setHighlight] = useState<string>()
	const panelOpen = useStore(accountTutorialOpen)
	const request = useStore(accountTutorialRequest)
	// O provedor do e-mail é a única escolha da conta: o tutorial mostra o caminho dele, sem abas próprias
	const [smtpProvider, setSmtpProvider] = useState<SmtpProviderChoice>(() => initialSmtpProvider(status.smtp.values))
	const tutorialPath = group === 'smtp' ? smtpProvider : undefined
	const tutorialId = `${group}-tutorial`

	/** Abre o tutorial, com o passo que resolve a falha do teste em destaque. */
	function showTutorial(step?: string) {
		if (!compact) {
			setDialog({ step })
			return
		}
		setHighlight(step)
		accountTutorialOpen.set(true)
		// O botão que abriu some: o foco vai para o tutorial (o passo em destaque, se houver, pega o foco depois)
		if (!step) requestAnimationFrame(() => document.getElementById(tutorialId)?.focus())
	}

	function closePanel() {
		accountTutorialOpen.set(false)
		setHighlight(undefined)
		requestAnimationFrame(() => document.getElementById(`${tutorialId}-open`)?.focus())
	}

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

	const mainFields = config.fields.filter(field => !field.advanced)
	const advancedFields = config.fields.filter(field => field.advanced)
	// Uma vez aberto por um campo pedido (erro ao salvar ou testar, um domínio sem servidor conhecido), o "avançado" não
	// fecha sozinho de novo: senão sumiria enquanto a pessoa preenche o campo
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const advancedError = advancedFields.some(field => !!errors[field.name])

	// O pedido de fora (o teste do login do LinkedIn, que fica fora deste formulário) abre o tutorial no passo dele e o
	// "avançado", onde fica o campo do passo (o cookie li_at)
	useEffect(() => {
		if (request?.group !== group) return
		// Atendido, o pedido some: uma conta montada depois (em outra tela) não abre o tutorial sozinha
		accountTutorialRequest.set(null)
		setAdvancedOpen(true)
		showTutorial(request.step)
	}, [request])
	useEffect(() => {
		if (advancedError) setAdvancedOpen(true)
	}, [advancedError])

	function renderField(field: FieldDef) {
		const id = `${group}-${field.name}`
		const isRemoved = removed.includes(field.name)
		const hasSaved = field.secret && secrets[field.name]
		const live = field.live?.(draft as Record<string, string>) ?? {}
		const help = isRemoved ? 'Será removido ao salvar.' : (live.help ?? field.help)
		const placeholder = live.placeholder ?? field.placeholder

		return (
			<div key={field.name} className={cx('flex flex-col gap-1.5 max-md:col-span-1', FIELD_SPANS[field.span ?? 2])}>
				{/* O segredo salvo fica dito ao lado do rótulo, e não só no placeholder, que some ao digitar */}
				<div className="flex items-center gap-2">
					<FieldLabel htmlFor={id}>{field.label}</FieldLabel>
					{hasSaved && !isRemoved && <span className="text-xs text-muted">salvo · vazio mantém</span>}
				</div>
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
						placeholder={hasSaved ? '••••••••' : (placeholder ?? (field.optional ? 'opcional' : ''))}
						invalid={!!errors[field.name]}
						aria-describedby={errors[field.name] ? `${id}-error` : help ? `${id}-help` : undefined}
						onChange={event => {
							const value = event.target.value
							setDraft(current => ({ ...current, [field.name]: value }))
							setErrors(current => ({ ...current, [field.name]: '' }))
							setCheck(null)
						}}
						onBlur={() => {
							if (field.revealsAdvanced?.(draft as Record<string, string>)) setAdvancedOpen(true)
						}}
					/>
					{field.optional && hasSaved && (
						<IconButton
							label={isRemoved ? `Manter o ${field.label} salvo` : `Remover o ${field.label} salvo`}
							variant="ghost"
							onClick={() => {
								setRemoved(current => (isRemoved ? current.filter(name => name !== field.name) : [...current, field.name]))
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
	}

	// A escolha do provedor do e-mail escolhe também o caminho do tutorial: no onboarding, fica antes dele
	const providerGuide = group === 'smtp' && (
		<SmtpProviderGuide
			values={draft as Record<string, string>}
			provider={smtpProvider}
			onChoose={next => {
				setSmtpProvider(next)
				// Fora do Gmail, o servidor não sai do e-mail (ou pode não sair): ele fica no "avançado"
				if (next !== GMAIL_PRESET.id) setAdvancedOpen(true)
			}}
		/>
	)

	/** O último passo do tutorial leva ao primeiro campo da conta. */
	const toFields = {
		label: 'ir para os campos',
		onClick: () => requestAnimationFrame(() => document.getElementById(`${group}-${mainFields[0]?.name}`)?.focus()),
	}

	// O que cada conta pede: os campos, o testar e o salvar
	const fields = (
		<>
			{!compact && current.source === null && config.missing && (
				<Notice tone="warn" icon="alert">
					<p>{config.missing}</p>
				</Notice>
			)}

			{!compact && providerGuide}

			<div className={FIELD_GRID}>{mainFields.map(renderField)}</div>

			{/* O que tem um padrão que serve para quase todo mundo fica recolhido; abre sozinho quando um campo de lá é pedido */}
			{advancedFields.length > 0 && (
				<Disclosure summary={`avançado: ${advancedFields.map(field => field.label).join(', ')}`} defaultOpen={advancedOpen}>
					<div className={cx(FIELD_GRID, 'mt-3 text-ink')}>{advancedFields.map(renderField)}</div>
				</Disclosure>
			)}

			{/*
			 * Como a barra de salvar da página: as ações à direita, o "descartar" sempre no lugar (desligado sem alteração) e o
			 * "salvar" por último; o "apagar do site" fica sozinho do outro lado, longe do testar e do salvar
			 */}
			<div className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-3">
					{current.source === 'database' && (
						<Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
							apagar do site
						</Button>
					)}
					<div className="ml-auto flex flex-wrap items-center justify-end gap-3">
						{config.testable && (
							<Button
								variant="ghost"
								disabled={busy !== null || (current.source === null && !dirty)}
								onClick={() => run('test')}
							>
								{busy === 'test' ? 'testando…' : 'testar'}
							</Button>
						)}
						<Button variant="ghost" disabled={!dirty || busy !== null} onClick={() => reset(status)}>
							descartar
						</Button>
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
					</div>
				</div>
				{config.testHelp && <FieldHelp className="text-right">{config.testHelp}</FieldHelp>}
			</div>

			<div role="status" className="empty:hidden">
				{check && (
					<p className={cx('flex items-start gap-2 text-sm', check.ok ? 'text-ok' : 'text-danger')}>
						<Icon name={check.ok ? 'check' : 'alert'} className="mt-0.5" />
						<span>
							{check.message}
							{/* A falha leva ao tutorial, no passo que costuma resolver (ex.: a senha de app no login recusado) */}
							{!check.ok && (
								<>
									{' · '}
									<TextLink size="sm" onClick={() => showTutorial(check.step)}>
										ver o passo a passo
									</TextLink>
								</>
							)}
						</span>
					</p>
				)}
			</div>
		</>
	)

	return (
		<>
			{dialog && (
				<TutorialDialog
					{...ACCOUNT_TUTORIALS[group]}
					// O provedor fica atrás da modal: ela diz como trocar de caminho
					intro={
						group === 'smtp'
							? `${ACCOUNT_TUTORIALS.smtp.intro} Para outro provedor, feche e troque a escolha na conta.`
							: ACCOUNT_TUTORIALS[group].intro
					}
					path={tutorialPath}
					highlight={dialog.step}
					scene={(path, step) => accountScene(group, path, step.id)}
					done={toFields}
					onClose={() => setDialog(null)}
				/>
			)}
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

			{/* O selo fica sempre à direita, na primeira linha: a nota quebra linha ao lado dele em vez de empurrá-lo para baixo */}
			{!compact && (
				<div className="flex items-start justify-between gap-3">
					<FieldHelp className="min-w-0">
						{config.note}{' '}
						<TextLink size="sm" onClick={() => showTutorial()}>
							como configurar
						</TextLink>
					</FieldHelp>
					<Badge className="shrink-0" tone={badge.tone} title={'title' in badge ? badge.title : undefined}>
						{badge.label}
					</Badge>
				</div>
			)}

			{compact ? (
				// O tutorial fica acima dos campos, na largura toda: um passo por vez, com a animação ao lado do texto
				<div className="flex flex-col gap-6">
					{providerGuide}
					{panelOpen ? (
						// Sem moldura própria (já está dentro do cartão): só a linha que o separa dos campos
						<Tutorial
							id={tutorialId}
							{...ACCOUNT_TUTORIALS[group]}
							path={tutorialPath}
							highlight={highlight}
							scene={(path, step) => accountScene(group, path, step.id)}
							onClose={closePanel}
							closeLabel="Esconder os tutoriais das contas (voltam em “como configurar”)"
							done={toFields}
							className="border-b border-line pb-6"
						/>
					) : (
						<Button id={`${tutorialId}-open`} variant="ghost" size="sm" className="self-start" onClick={() => showTutorial()}>
							<Icon name="info" />
							como configurar
						</Button>
					)}
					<div className="flex min-w-0 flex-col gap-5">{fields}</div>
				</div>
			) : (
				fields
			)}
		</>
	)
}

/**
 * O topo da conta de e-mail: a escolha do provedor (o Gmail, recomendado, o Outlook de trabalho ou escola, ou outro),
 * que também escolhe o caminho do tutorial, e o aviso das contas pessoais da Microsoft, que não aceitam senha no SMTP.
 * O aviso não impede de salvar: pode ser uma conta de trabalho. Os passos da senha de app ficam no tutorial da conta
 * (`account-tutorials.ts`).
 */
function SmtpProviderGuide({
	values,
	provider,
	onChoose,
}: {
	values: Record<string, string>
	provider: SmtpProviderChoice
	onChoose: (next: SmtpProviderChoice) => void
}) {
	const labelId = useId()

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
				<span id={labelId} className={LABEL}>
					provedor
				</span>
				<PillGroup role="group" aria-labelledby={labelId}>
					{SMTP_PROVIDER_OPTIONS.map(option => (
						<Pill key={option.id} pressed={provider === option.id} onClick={() => onChoose(option.id)}>
							{option.label}
						</Pill>
					))}
				</PillGroup>
			</div>

			{isMicrosoftPersonalAccount(values) && (
				<Notice tone="warn" icon="alert">
					<p>
						A Microsoft não aceita senha, nem senha de app, no SMTP das contas pessoais (Outlook, Hotmail e Live): o teste e o
						envio vão falhar.{' '}
						<TextLink size="sm" onClick={() => onChoose(GMAIL_PRESET.id)}>
							usar o Gmail
						</TextLink>
						. Contas Microsoft 365 de trabalho ou escola funcionam se o administrador liberar o SMTP AUTH.
					</p>
				</Notice>
			)}
		</div>
	)
}
