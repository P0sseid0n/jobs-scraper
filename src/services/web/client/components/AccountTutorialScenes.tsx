import type { ReactNode } from 'react'

import type { CredentialGroup } from '../../api-types'
import { cx } from '../lib/cx'
import { Cursor, Swap, Typed, useDemoRound } from './demo-parts'
import { Icon } from './Icon'

/** Uma volta da cena até recomeçar: uns 3 s montando e o resto parada no fim, para dar tempo de ler. */
const ROUND_MS = 7000

const POP = 'animate-pop-in motion-reduce:animate-none'

/**
 * A janela do serviço, desenhada com as cores do site: a barra com o endereço e a tela simplificada, com só o que o passo
 * usa. Toca em loop; decorativa (o texto do passo diz o mesmo).
 */
function SceneWindow({ address, children }: { address: string; children: ReactNode }) {
	const { round, leaving } = useDemoRound(ROUND_MS)

	return (
		<div aria-hidden="true" className="flex h-52 flex-col overflow-hidden rounded-md border border-line bg-bg text-ink select-none">
			<div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
				<span className="flex gap-1">
					<span className="size-1.5 rounded-full bg-line-strong" />
					<span className="size-1.5 rounded-full bg-line-strong" />
					<span className="size-1.5 rounded-full bg-line-strong" />
				</span>
				<span className="min-w-0 truncate rounded-pill bg-surface px-2.5 py-0.5 font-mono text-xs text-muted">{address}</span>
			</div>
			<div
				key={round}
				className={cx('relative flex grow flex-col gap-3 p-4 text-sm transition-opacity duration-500', leaving && 'opacity-0')}
			>
				{children}
			</div>
		</div>
	)
}

/** Um campo de formulário da cena, com o rótulo em cima. */
function Field({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
	return (
		<span className={cx('flex flex-col gap-1', className)}>
			<span className="text-xs text-muted">{label}</span>
			<span className="flex h-8 items-center overflow-hidden rounded-sm border border-line bg-surface px-2.5 font-mono text-xs">
				{children}
			</span>
		</span>
	)
}

/** Um botão da cena, que afunda no clique (`press`: o atraso do clique). */
function Pill({ press, tone = 'ghost', children }: { press?: string; tone?: 'lime' | 'ghost'; children: ReactNode }) {
	return (
		<span
			className={cx(
				'inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-xs font-semibold',
				tone === 'lime' ? 'bg-lime text-lime-ink' : 'border border-line-strong',
				press && 'animate-press-once motion-reduce:animate-none',
				press,
			)}
		>
			{children}
		</span>
	)
}

/** O interruptor desligado e, depois do clique, ligado. */
function SwitchMock({ on }: { on: boolean }) {
	return (
		<span className={cx('flex h-5 w-9 items-center rounded-pill p-0.5', on ? 'justify-end bg-lime' : 'bg-line-strong')}>
			<span className="size-4 rounded-full bg-surface shadow-soft" />
		</span>
	)
}

/** A linha do resultado do teste, que aparece no fim (`delay`). */
function Result({ tone, delay, children }: { tone: 'ok' | 'danger' | 'warn'; delay?: string; children: ReactNode }) {
	return (
		<span
			className={cx(
				'flex items-center gap-1.5 text-xs',
				{ ok: 'text-ok', danger: 'text-danger', warn: 'text-warn' }[tone],
				delay && POP,
				delay,
			)}
		>
			<Icon name={tone === 'ok' ? 'check' : 'alert'} size={14} />
			{children}
		</span>
	)
}

/** A senha de app que o serviço mostra uma vez, para copiar. */
function AppPassword({ value, delay }: { value: string; delay: string }) {
	return (
		<span className={cx('flex items-center justify-between gap-2 rounded-sm bg-lime-soft px-3 py-2', POP, delay)}>
			<span className="flex flex-col">
				<span className="text-xs text-muted">sua senha de app</span>
				<span className="font-mono text-sm font-semibold tracking-wider">{value}</span>
			</span>
			<Icon name="copy" size={14} className="text-lime-text" />
		</span>
	)
}

const EMAIL_SCENES: Record<string, Record<string, () => ReactNode>> = {
	gmail: {
		'two-step': () => (
			<SceneWindow address="myaccount.google.com › Segurança">
				<span className="flex flex-col">
					<span className="font-semibold">Verificação em duas etapas</span>
					<span className="text-xs text-muted">Um segundo passo para entrar na conta</span>
				</span>
				<span className="relative flex items-center justify-between rounded-sm border border-line bg-surface px-3 py-2.5">
					<span className="text-xs">
						<Swap outDelay="stagger-14" inDelay="stagger-15" working="Desativada" done="Ativada" />
					</span>
					<Swap outDelay="stagger-14" inDelay="stagger-15" working={<SwitchMock on={false} />} done={<SwitchMock on />} />
					<Cursor className="top-1/2 right-4 stagger-6" />
				</span>
				<Result tone="ok" delay="stagger-20">
					agora dá para criar a senha de app
				</Result>
			</SceneWindow>
		),
		'app-password': () => (
			<SceneWindow address="myaccount.google.com › Senhas de app">
				<span className="relative flex items-end gap-2">
					<Field label="nome do app" className="grow">
						<Typed delay="stagger-3">jobs-scraper</Typed>
					</Field>
					<Pill tone="lime" press="stagger-22">
						criar
					</Pill>
					<Cursor className="right-3 bottom-1 stagger-14" />
				</span>
				<AppPassword value="abcd efgh ijkl mnop" delay="stagger-25" />
			</SceneWindow>
		),
		fields: () => (
			<SceneWindow address="jobs/scraper › contas › e-mail">
				<span className="grid grid-cols-2 gap-2">
					<Field label="usuário">
						<Typed delay="stagger-3">voce@gmail.com</Typed>
					</Field>
					<Field label="senha de app">
						<Typed delay="stagger-14">••••••••••••••••</Typed>
					</Field>
				</span>
				<span className="relative flex items-center gap-3">
					<Pill press="stagger-32">testar</Pill>
					<Cursor className="top-1 left-6 stagger-24" />
					<Result tone="ok" delay="stagger-35">
						login aceito em smtp.gmail.com
					</Result>
				</span>
			</SceneWindow>
		),
		refused: () => (
			<SceneWindow address="jobs/scraper › contas › e-mail">
				<Result tone="danger">o Gmail recusou o login (SMTP 535 5.7.8)</Result>
				<Field label="senha">
					<span className="flex items-center gap-2">
						<span className="strike-through animate-strike-in text-muted motion-reduce:animate-none stagger-8">
							senha-do-google
						</span>
						<Typed delay="stagger-14" className="text-lime-text">
							abcd efgh ijkl mnop
						</Typed>
					</span>
				</Field>
				<Result tone="ok" delay="stagger-30">
					com a senha de app, o login é aceito
				</Result>
			</SceneWindow>
		),
	},
	outlook: {
		'smtp-auth': () => (
			<SceneWindow address="admin.microsoft.com › Usuários ativos">
				<span className="font-semibold">Gerenciar aplicativos de email</span>
				<span className="relative flex flex-col gap-1.5 text-xs">
					{['IMAP', 'POP'].map(app => (
						<span key={app} className="flex items-center gap-2">
							<Checked on />
							{app}
						</span>
					))}
					<span className="flex items-center gap-2">
						<Swap outDelay="stagger-13" inDelay="stagger-14" working={<Checked on={false} />} done={<Checked on />} />
						SMTP autenticado
					</span>
					<Cursor className="bottom-0 left-1 stagger-5" />
				</span>
				<span className="relative flex items-center gap-3">
					<Pill tone="lime" press="stagger-26">
						salvar alterações
					</Pill>
					<Cursor className="top-1 left-12 stagger-18" />
					<Result tone="ok" delay="stagger-29">
						salvo
					</Result>
				</span>
			</SceneWindow>
		),
		'app-password': () => (
			<SceneWindow address="mysignins.microsoft.com › Informações de segurança">
				<span className="relative self-start">
					<Pill press="stagger-12">
						<Icon name="plus" size={12} />
						adicionar método de entrada
					</Pill>
					<Cursor className="top-2 left-10 stagger-4" />
				</span>
				<span className={cx('relative flex flex-col rounded-sm border border-line bg-surface text-xs', POP, 'stagger-14')}>
					<span className="px-3 py-1.5 text-muted">Aplicativo autenticador</span>
					<span className="bg-lime-soft px-3 py-1.5 font-semibold text-lime-text">Senha de aplicativo</span>
					<Cursor className="bottom-1 left-24 stagger-16" />
				</span>
				<AppPassword value="kxqz tpwm rvbn hdfs" delay="stagger-27" />
			</SceneWindow>
		),
		fields: () => (
			<SceneWindow address="jobs/scraper › contas › e-mail › avançado">
				<span className="grid grid-cols-2 gap-2">
					<Field label="usuário">
						<Typed delay="stagger-3">voce@empresa.com.br</Typed>
					</Field>
					<Field label="senha de app">
						<Typed delay="stagger-12">••••••••••••••••</Typed>
					</Field>
				</span>
				<span className="grid grid-cols-4 gap-2">
					<Field label="servidor SMTP" className="col-span-3">
						<Typed delay="stagger-21">smtp.office365.com</Typed>
					</Field>
					<Field label="porta">
						<Typed delay="stagger-30">587</Typed>
					</Field>
				</span>
			</SceneWindow>
		),
		refused: () => (
			<SceneWindow address="jobs/scraper › contas › e-mail">
				<Result tone="danger">o servidor recusou o login (SMTP 535 5.7.139)</Result>
				<span className={cx('flex items-center gap-1.5 text-xs text-muted', POP, 'stagger-10')}>
					<Icon name="chevron" size={14} />
					5.7.139: o SMTP AUTH está desligado para a sua caixa
				</span>
				<span
					className={cx('self-start rounded-pill bg-lime-soft px-3 py-1 text-xs font-semibold text-lime-text', POP, 'stagger-20')}
				>
					peça ao administrador para liberar (passo 1)
				</span>
			</SceneWindow>
		),
	},
}

/** A caixa de seleção da cena, marcada ou não. */
function Checked({ on }: { on: boolean }) {
	return (
		<span
			className={cx(
				'grid size-4 place-items-center rounded-xs border',
				on ? 'border-ink bg-ink text-bg dark:border-lime dark:bg-lime dark:text-lime-ink' : 'border-line-strong',
			)}
		>
			{on && <Icon name="check" size={12} />}
		</span>
	)
}

const SCENES: Partial<Record<CredentialGroup, Record<string, Record<string, () => ReactNode>>>> = {
	smtp: EMAIL_SCENES,
}

/** A cena animada de um passo do tutorial da conta, ou `null` se o passo ainda não tem uma. */
export function accountScene(group: CredentialGroup, path: string, step: string): ReactNode {
	return SCENES[group]?.[path]?.[step]?.() ?? null
}
