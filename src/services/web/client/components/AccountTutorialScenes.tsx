import { useState, type ReactNode } from 'react'

import type { CredentialGroup } from '../../api-types'
import { cx } from '../lib/cx'
import { Cursor, Swap, Typed } from './demo-parts'
import { Icon } from './Icon'
import { IconButton } from './ui/IconButton'
import { META } from './ui/text'

const POP = 'animate-pop-in motion-reduce:animate-none'

/**
 * A janela do serviço, desenhada com as cores do site: a barra com o endereço e a tela simplificada, com só o que o passo
 * usa. Toca uma vez, em uns 3 s, e para no fim: em loop, distrairia quem preenche os campos ao lado (e o movimento que
 * passa de 5 s precisa de pausa). "Ver de novo" toca outra vez. Decorativa: o texto do passo diz o mesmo.
 */
function SceneWindow({ address, children }: { address: string; children: ReactNode }) {
	// Cada volta nova remonta a tela (a `key`) e reinicia as animações
	const [round, setRound] = useState(0)

	return (
		<div className="flex h-48 flex-col overflow-hidden rounded-md border border-line bg-bg text-ink select-none">
			<div className="flex items-center gap-2 border-b border-line bg-surface-2 py-1 pr-1 pl-3">
				<span aria-hidden="true" className="flex gap-1">
					<span className="size-1.5 rounded-full bg-line-strong" />
					<span className="size-1.5 rounded-full bg-line-strong" />
					<span className="size-1.5 rounded-full bg-line-strong" />
				</span>
				<span aria-hidden="true" className={cx(META, 'min-w-0 truncate rounded-pill bg-surface px-2.5 py-0.5')}>
					{address}
				</span>
				<IconButton
					label="Ver a animação de novo"
					size="xs"
					className="ml-auto text-muted motion-reduce:hidden"
					onClick={() => setRound(value => value + 1)}
				>
					<Icon name="refresh" size={12} />
				</IconButton>
			</div>
			<div key={round} aria-hidden="true" className="relative flex grow flex-col gap-2.5 p-3 text-sm">
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

/** O segredo que o serviço mostra uma vez, para copiar (a senha de app, o token do bot). */
function Secret({ label, value, delay }: { label: string; value: string; delay: string }) {
	return (
		<span className={cx('flex items-center justify-between gap-2 rounded-sm bg-lime-soft px-3 py-2', POP, delay)}>
			<span className="flex min-w-0 flex-col">
				<span className="text-xs text-muted">{label}</span>
				<span className="font-mono text-sm font-semibold tracking-wider">{value}</span>
			</span>
			<Icon name="copy" size={14} className="text-lime-text" />
		</span>
	)
}

const EMAIL_SCENES: Record<string, Record<string, () => ReactNode>> = {
	gmail: {
		'two-step': () => (
			<SceneWindow address="myaccount.google.com">
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
			<SceneWindow address="myaccount.google.com">
				<span className="relative flex items-end gap-2">
					<Field label="nome do app" className="grow">
						<Typed delay="stagger-3">jobs-scraper</Typed>
					</Field>
					<Pill tone="lime" press="stagger-22">
						criar
					</Pill>
					<Cursor className="right-3 bottom-1 stagger-14" />
				</span>
				<Secret label="sua senha de app" value="abcd efgh ijkl mnop" delay="stagger-25" />
			</SceneWindow>
		),
		fields: () => (
			<SceneWindow address="jobs/scraper">
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
			<SceneWindow address="jobs/scraper">
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
			<SceneWindow address="admin.microsoft.com">
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
			<SceneWindow address="mysignins.microsoft.com">
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
				<Secret label="sua senha de app" value="kxqz tpwm rvbn hdfs" delay="stagger-27" />
			</SceneWindow>
		),
		fields: () => (
			<SceneWindow address="jobs/scraper">
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
			<SceneWindow address="jobs/scraper">
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

/** A lista de canais do servidor, como a barra lateral do Discord. */
function ChannelList({ children }: { children: ReactNode }) {
	return <span className="flex flex-col gap-0.5 text-xs">{children}</span>
}

function Channel({ name, active, className }: { name: string; active?: boolean; className?: string }) {
	return (
		<span
			className={cx(
				'flex items-center gap-1.5 rounded-xs px-2 py-1',
				active ? 'bg-surface-2 font-semibold text-ink' : 'text-muted',
				className,
			)}
		>
			<span className="font-mono">#</span>
			{name}
		</span>
	)
}

/** O começo das duas abas do Discord: o portal de desenvolvedores, a aplicação e o bot. */
const DISCORD_SETUP_SCENES: Record<string, () => ReactNode> = {
	application: () => (
		<SceneWindow address="discord.com/developers">
			<span className="relative flex items-center justify-between">
				<span className="font-semibold">Applications</span>
				<Pill tone="lime" press="stagger-12">
					New Application
				</Pill>
				<Cursor className="top-2 right-8 stagger-4" />
			</span>
			{/* A janela de criar: o nome e o "Create" na mesma linha, para caber na cena */}
			<span className={cx('relative flex items-end gap-2 rounded-sm border border-line bg-surface p-2.5', POP, 'stagger-14')}>
				<Field label="name" className="grow">
					<Typed delay="stagger-16">Vagas</Typed>
				</Field>
				<Pill tone="lime" press="stagger-30">
					Create
				</Pill>
				<Cursor className="right-5 bottom-2 stagger-22" />
			</span>
		</SceneWindow>
	),
	token: () => (
		<SceneWindow address="discord.com/developers">
			<span className="flex gap-3">
				<span className="flex shrink-0 flex-col gap-1 text-xs text-muted">
					<span>General</span>
					<span>OAuth2</span>
					<span className="rounded-xs bg-surface-2 px-1.5 font-semibold text-ink">Bot</span>
				</span>
				<span className="relative flex min-w-0 grow flex-col gap-2">
					<span className="text-xs text-muted">token</span>
					<span className="self-start">
						<Pill press="stagger-12">Reset Token</Pill>
					</span>
					<Cursor className="top-6 left-10 stagger-4" />
					<Secret label="copie agora: ele só aparece uma vez" value="MTI4N…Gx9k.hz" delay="stagger-15" />
				</span>
			</span>
		</SceneWindow>
	),
}

/** O convite do bot (OAuth2 › URL Generator), com as permissões que a aba pede. */
function inviteScene(permissions: string[]) {
	return () => (
		<SceneWindow address="discord.com/developers">
			<span className="relative flex items-center justify-between gap-2 text-xs">
				<span className="font-semibold">URL Generator</span>
				<span className="flex items-center gap-1.5">
					<Swap outDelay="stagger-12" inDelay="stagger-13" working={<Checked on={false} />} done={<Checked on />} />
					bot
				</span>
				<Cursor className="top-1 right-6 stagger-4" />
			</span>
			<span className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
				{permissions.map((permission, index) => (
					<span key={permission} className={cx('flex min-w-0 items-center gap-1.5', POP, STAGGER[index])}>
						<Checked on />
						<span className="truncate">{permission}</span>
					</span>
				))}
			</span>
			<Field label="generated url">
				<Typed delay="stagger-28">discord.com/oauth2/authorize?…</Typed>
			</Field>
		</SceneWindow>
	)
}

// As classes inteiras, para o Tailwind encontrar no código: as permissões chegam uma depois da outra
const STAGGER = ['stagger-16', 'stagger-18', 'stagger-20', 'stagger-22', 'stagger-24', 'stagger-26']

const DISCORD_CHANNEL_ID = () => (
	<SceneWindow address="discord.com">
		<span className="relative flex gap-3">
			<ChannelList>
				<span className="px-2 pb-1 text-xs font-semibold text-muted">CANAIS</span>
				<Channel name="geral" />
				<Channel name="vagas" active />
			</ChannelList>
			<Cursor className="top-12 left-12 stagger-4" />
			<span className={cx('relative flex flex-col rounded-sm border border-line bg-surface py-1 text-xs', POP, 'stagger-13')}>
				<span className="px-3 py-1 text-muted">Silenciar canal</span>
				<span className="px-3 py-1 text-muted">Editar canal</span>
				<span className="bg-lime-soft px-3 py-1 font-semibold text-lime-text">Copiar ID do canal</span>
				<Cursor className="bottom-1 left-16 stagger-15" />
			</span>
		</span>
		<Result tone="ok" delay="stagger-27">
			copiado: 123456789012345678
		</Result>
	</SceneWindow>
)

const DISCORD_SCENES: Record<string, Record<string, () => ReactNode>> = {
	text: {
		...DISCORD_SETUP_SCENES,
		invite: inviteScene(['View Channels', 'Send Messages', 'Embed Links', 'Attach Files', 'Read Message History']),
		channel: () => (
			<SceneWindow address="discord.com">
				<span className="font-semibold">Criar canal</span>
				<span className="flex gap-2 text-xs">
					<span className="flex items-center gap-1.5 rounded-sm border border-ink px-2.5 py-1.5 font-semibold">
						<span className="font-mono">#</span> Texto
					</span>
					<span className="flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-muted">Voz</span>
				</span>
				<span className="relative flex items-end gap-2">
					<Field label="nome do canal" className="grow">
						<Typed delay="stagger-4"># vagas</Typed>
					</Field>
					<Pill tone="lime" press="stagger-22">
						criar canal
					</Pill>
					<Cursor className="right-6 bottom-1 stagger-14" />
				</span>
			</SceneWindow>
		),
		'channel-id': DISCORD_CHANNEL_ID,
	},
	forum: {
		...DISCORD_SETUP_SCENES,
		invite: inviteScene([
			'View Channels',
			'Send Messages',
			'Send Messages in Threads',
			'Embed Links',
			'Attach Files',
			'Read Message History',
		]),
		channel: () => (
			<SceneWindow address="discord.com">
				<span className="flex flex-col">
					<span className="font-semibold"># vagas · Tags</span>
					<span className="text-xs text-muted">o bot põe até 5 por vaga, pelo nome</span>
				</span>
				<span className="flex flex-wrap gap-1.5">
					{['Remoto', 'Híbrido', 'CLT', 'PJ', 'React', 'Python'].map((tag, index) => (
						<span
							key={tag}
							className={cx(
								'rounded-pill border border-line-strong px-2.5 py-0.5 text-xs font-semibold',
								POP,
								TAG_STAGGER[index],
							)}
						>
							{tag}
						</span>
					))}
				</span>
				<span className={cx('flex items-center gap-1.5 text-xs text-muted', POP, 'stagger-26')}>
					<Icon name="chevron" size={14} />
					uma vaga remota, CLT, de React ganha as três
				</span>
			</SceneWindow>
		),
		'channel-id': DISCORD_CHANNEL_ID,
	},
}

const TAG_STAGGER = ['stagger-4', 'stagger-8', 'stagger-12', 'stagger-16', 'stagger-20', 'stagger-23']

const SCENES: Partial<Record<CredentialGroup, Record<string, Record<string, () => ReactNode>>>> = {
	smtp: EMAIL_SCENES,
	discord: DISCORD_SCENES,
}

/** A cena animada de um passo do tutorial da conta, ou `null` se o passo ainda não tem uma. */
export function accountScene(group: CredentialGroup, path: string, step: string): ReactNode {
	return SCENES[group]?.[path]?.[step]?.() ?? null
}
