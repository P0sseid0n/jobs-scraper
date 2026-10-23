import { createRootRoute, Link, Outlet, useMatches, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { ScraperStatus } from '../../api-types'
import { api } from '../api'
import { CvTray } from '../components/CvTray'
import { Icon, type IconName } from '../components/Icon'
import { ProjectIcon } from '../components/ProjectIcon'
import { Badge, badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Page, pageFrame } from '../components/ui/Page'
import { useSlidingIndicator } from '../components/ui/sliding-indicator'
import { StatusDot, type StatusDotTone } from '../components/ui/StatusDot'
import { cx } from '../lib/cx'
import { formatDuration } from '../lib/format'
import { useTrayRequests } from '../stores/cv'
import { jobsStore } from '../stores/jobs'
import { useConnected } from '../stores/live'
import { toggleTheme } from '../stores/theme'
import { dismissToast, useToasts } from '../stores/toast'

/** A moldura de todas as telas: cabeçalho, navegação, bandeja de currículos e avisos. */
export const Route = createRootRoute({ component: RootLayout, notFoundComponent: NotFound })

const NAV = [
	{ path: '/', label: 'vagas', icon: 'briefcase' },
	{ path: '/curriculos', label: 'currículos', icon: 'file' },
	{ path: '/coletas', label: 'coletas', icon: 'refresh' },
	{ path: '/configuracoes', label: 'ajustes', icon: 'settings' },
] as const satisfies readonly { path: string; label: string; icon: IconName }[]

/** Voltar para a lista mantém os últimos filtros usados. */
const lastFilters = () => jobsStore.get().filters

const PILL_DOTS: Record<'running' | 'failed' | 'paused' | 'idle', { tone: StatusDotTone; glow?: boolean }> = {
	running: { tone: 'lime', glow: true },
	failed: { tone: 'current' },
	paused: { tone: 'muted' },
	idle: { tone: 'ok' },
}

/** Status do scraper no cabeçalho, atualizado a cada 30 s. */
function useScraperPill() {
	const [status, setStatus] = useState<ScraperStatus | null>(null)
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		let active = true
		const refresh = () =>
			api.scraperStatus().then(
				value => active && setStatus(value),
				() => active && setStatus(null),
			)

		void refresh()
		const timer = setInterval(() => {
			setNow(Date.now())
			void refresh()
		}, 30_000)

		return () => {
			active = false
			clearInterval(timer)
		}
	}, [])

	if (!status) return null
	if (status.current) return { tone: 'running' as const, text: 'coletando agora' }
	if (status.last?.status === 'failed') return { tone: 'failed' as const, text: 'última coleta falhou' }
	if (status.paused) return { tone: 'paused' as const, text: 'coletas pausadas' }
	if (status.activeSearchTerms === 0) return { tone: 'paused' as const, text: 'sem termos de busca' }
	if (!status.linkedinAccount) return { tone: 'paused' as const, text: 'conecte o LinkedIn' }

	const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : 0
	return {
		tone: 'idle' as const,
		text: next > 60_000 ? `próxima em ${formatDuration(next).replace(/ \d+s$/, '')}` : 'próxima a qualquer momento',
	}
}

function NotFound() {
	return (
		<Page width="narrow">
			<EmptyState
				title="Página não encontrada"
				action={
					<ButtonLink variant="lime" to="/">
						ver vagas
					</ButtonLink>
				}
			/>
		</Page>
	)
}

function RootLayout() {
	const path = useRouterState({ select: state => state.location.pathname })
	// O título da rota mais funda (o `staticData.title` de cada arquivo de `routes/`)
	const title = useMatches({ select: matches => matches.at(-1)?.staticData.title })
	const pill = useScraperPill()
	const connected = useConnected()
	const toasts = useToasts()
	const pendingCvs = useTrayRequests().filter(request => request.status === 'pending').length
	const nav = useSlidingIndicator<HTMLElement>('[aria-current="page"]', path)

	// "vagas" também fica marcado com uma vaga aberta (`/vagas/$id`)
	const isActive = (item: string) => (item === '/' ? path === '/' || path.startsWith('/vagas/') : path.startsWith(item))

	useEffect(() => {
		document.title = `${title ?? 'Jobs Scraper'} · jobs/scraper`
	}, [title])

	return (
		<div className="flex min-h-dvh flex-col">
			<a className="absolute -top-15 left-3 z-50 rounded-pill bg-lime px-3.5 py-2.5 text-lime-ink focus:top-3" href="#main">
				pular para o conteúdo
			</a>
			<header className="sticky top-0 z-20 border-b border-line bg-bg/88 backdrop-blur-md">
				<div className={pageFrame({ className: 'flex items-center gap-4 py-3' })}>
					<Link
						className="inline-flex items-center gap-2 font-mono text-sm font-medium whitespace-nowrap no-underline"
						to="/"
						search={lastFilters}
					>
						<ProjectIcon />
						jobs/scraper<span className="text-lime-text">_</span>
					</Link>
					<nav ref={nav.container} className="relative flex flex-auto gap-1 max-md:hidden" aria-label="Principal">
						{/* O fundo da tela atual, que desliza até a nova */}
						{nav.box && (
							<span
								aria-hidden="true"
								className={cx(
									'pointer-events-none absolute inset-y-0 left-0 rounded-pill bg-surface-2',
									nav.box.slide && 'transition-all duration-500 ease-spring motion-reduce:transition-none',
								)}
								style={{ translate: `${nav.box.left}px 0`, width: nav.box.width }}
							/>
						)}
						{NAV.map(item => (
							<Link
								key={item.path}
								className={cx(
									'relative rounded-pill px-3 py-2 text-sm text-muted no-underline transition duration-300 ease-spring hover:text-ink active:scale-95 active:duration-75',
									isActive(item.path) && 'text-ink',
								)}
								to={item.path}
								search={item.path === '/' ? lastFilters : undefined}
								aria-current={isActive(item.path) ? 'page' : undefined}
							>
								{item.path === '/configuracoes' ? 'configurações' : item.label}
							</Link>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-2.5">
						{pill && (
							<Link
								className={badge({
									tone: 'plain',
									size: 'lg',
									bordered: true,
									className: cx('text-muted max-md:hidden', pill.tone === 'failed' && 'border-danger text-danger'),
								})}
								to="/coletas"
							>
								<StatusDot {...PILL_DOTS[pill.tone]} />
								{pill.text}
							</Link>
						)}
						{!connected && (
							<Badge tone="plain" bordered="dashed" className="text-muted" title="Sem conexão em tempo real; reconectando…">
								offline
							</Badge>
						)}
						<IconButton label="Alternar tema claro/escuro" bordered onClick={toggleTheme}>
							{/* Os dois ícones no mesmo lugar: um gira e encolhe enquanto o outro cresce */}
							<Icon
								name="moon"
								className="col-start-1 row-start-1 transition duration-500 ease-spring dark:scale-0 dark:rotate-90 dark:opacity-0"
							/>
							<Icon
								name="sun"
								className="col-start-1 row-start-1 scale-0 -rotate-90 opacity-0 transition duration-500 ease-spring dark:scale-100 dark:rotate-0 dark:opacity-100"
							/>
						</IconButton>
					</div>
				</div>
			</header>

			<main id="main" className="flex-1 outline-none" tabIndex={-1}>
				<Outlet />
			</main>

			<nav
				className="fixed inset-x-0 bottom-0 z-30 hidden grid-cols-4 border-t border-line bg-bg px-2 pt-1 pb-safe-2 max-md:grid"
				aria-label="Principal (celular)"
			>
				{NAV.map(item => (
					<Link
						key={item.path}
						className={cx(
							'relative flex min-h-13 flex-col items-center gap-1 pt-2 pb-1 text-xs text-muted no-underline',
							isActive(item.path) && 'font-semibold text-ink',
						)}
						to={item.path}
						search={item.path === '/' ? lastFilters : undefined}
						aria-current={isActive(item.path) ? 'page' : undefined}
					>
						{/* O ícone da tela que acabou de abrir dá um pulo */}
						<Icon name={item.icon} size={20} className={cx(isActive(item.path) && 'animate-pop motion-reduce:animate-none')} />
						{item.label}
						{item.path === '/curriculos' && pendingCvs > 0 && (
							<Badge tone="lime" size="xs" className="absolute top-1 left-1/2 ml-1.5">
								{pendingCvs}
							</Badge>
						)}
					</Link>
				))}
			</nav>

			<CvTray />

			<div
				className="pointer-events-none fixed inset-x-4 bottom-6 z-40 mx-auto flex max-w-115 flex-col gap-2 max-md:bottom-safe-21"
				aria-live="polite"
			>
				{toasts.map(toast => (
					<div
						key={toast.id}
						className={cx(
							'pointer-events-auto flex items-center gap-2.5 rounded-md bg-ink py-2 pr-2 pl-3.5 text-sm text-bg shadow-float animate-toast-in motion-reduce:animate-none',
							toast.tone === 'error' && 'border border-danger bg-danger-bg text-danger',
						)}
						role={toast.tone === 'error' ? 'alert' : 'status'}
					>
						<span className="grow">{toast.message}</span>
						<IconButton label="Fechar aviso" size="sm" onClick={() => dismissToast(toast.id)}>
							<Icon name="close" size={14} />
						</IconButton>
					</div>
				))}
			</div>
		</div>
	)
}
