import { useEffect, useState } from 'react'

import type { ScraperStatus } from '../api-types'
import { api } from './api'
import { CvTray } from './components/CvTray'
import { Icon, type IconName } from './components/Icon'
import { ProjectIcon } from './components/ProjectIcon'
import { Badge, badge } from './components/ui/Badge'
import { Button } from './components/ui/Button'
import { EmptyState } from './components/ui/EmptyState'
import { IconButton } from './components/ui/IconButton'
import { Page } from './components/ui/Page'
import { StatusDot, type StatusDotTone } from './components/ui/StatusDot'
import { cx } from './lib/cx'
import { formatDuration } from './lib/format'
import { useWideLayout } from './lib/media'
import { matchPath, onLinkClick, useRoute } from './router'
import { useTrayRequests } from './stores/cv'
import { useConnected } from './stores/live'
import { toggleTheme } from './stores/theme'
import { dismissToast, useToasts } from './stores/toast'
import { CvsView } from './views/CvsView'
import { JobPage } from './views/JobPage'
import { JobsView } from './views/JobsView'
import { RunsView } from './views/RunsView'
import { SettingsView } from './views/SettingsView'

const NAV: { path: string; label: string; icon: IconName }[] = [
	{ path: '/', label: 'vagas', icon: 'briefcase' },
	{ path: '/curriculos', label: 'currículos', icon: 'file' },
	{ path: '/coletas', label: 'coletas', icon: 'refresh' },
	{ path: '/configuracoes', label: 'ajustes', icon: 'settings' },
]

const TITLES: Record<string, string> = {
	'/': 'Vagas',
	'/curriculos': 'Meus currículos',
	'/coletas': 'Coletas',
	'/configuracoes': 'Configurações',
}

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

	const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : 0
	return {
		tone: 'idle' as const,
		text: next > 60_000 ? `próxima em ${formatDuration(next).replace(/ \d+s$/, '')}` : 'próxima a qualquer momento',
	}
}

function View({ path }: { path: string }) {
	const wide = useWideLayout()

	// No desktop a vaga abre no painel ao lado da lista: é o mesmo JobsView de `/`, que mantém o estado ao trocar de vaga
	const job = matchPath('/vagas/:id', path)
	if (job?.id) return wide ? <JobsView selectedRouteId={job.id} /> : <JobPage routeId={job.id} />

	switch (path.replace(/\/$/, '') || '/') {
		case '/':
			return <JobsView selectedRouteId={null} />
		case '/curriculos':
			return <CvsView />
		case '/coletas':
			return <RunsView />
		case '/configuracoes':
			return <SettingsView />
		default:
			return (
				<Page width="narrow">
					<EmptyState
						title="Página não encontrada"
						action={
							<Button variant="lime" href="/" onClick={onLinkClick}>
								ver vagas
							</Button>
						}
					/>
				</Page>
			)
	}
}

export function App() {
	const { path } = useRoute()
	const pill = useScraperPill()
	const connected = useConnected()
	const toasts = useToasts()
	const pendingCvs = useTrayRequests().filter(request => request.status === 'pending').length

	const isActive = (item: string) => (item === '/' ? path === '/' || path.startsWith('/vagas/') : path.startsWith(item))

	useEffect(() => {
		document.title = `${TITLES[path] ?? (path.startsWith('/vagas/') ? 'Vaga' : 'Jobs Scraper')} · jobs/scraper`
	}, [path])

	return (
		<div className="flex min-h-screen flex-col">
			<a className="absolute -top-15 left-3 z-50 rounded-pill bg-lime px-3.5 py-2.5 text-lime-ink focus:top-3" href="#main">
				pular para o conteúdo
			</a>
			<header className="sticky top-0 z-20 border-b border-line bg-bg/88 backdrop-blur-md">
				<div className="mx-auto flex max-w-340 items-center gap-4 px-6 py-3 max-md:px-4">
					<a
						className="inline-flex items-center gap-2 font-mono text-sm font-medium whitespace-nowrap no-underline"
						href="/"
						onClick={onLinkClick}
					>
						<ProjectIcon />
						jobs/scraper<span className="text-lime-text">_</span>
					</a>
					<nav className="flex flex-auto gap-1 max-md:hidden" aria-label="Principal">
						{NAV.map(item => (
							<a
								key={item.path}
								className={cx(
									'rounded-pill px-3 py-2 text-sm text-muted no-underline hover:text-ink',
									isActive(item.path) && 'bg-surface-2 text-ink',
								)}
								href={item.path}
								aria-current={isActive(item.path) ? 'page' : undefined}
								onClick={onLinkClick}
							>
								{item.path === '/configuracoes' ? 'configurações' : item.label}
							</a>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-2.5">
						{pill && (
							<a
								className={badge({
									tone: 'plain',
									size: 'lg',
									bordered: true,
									className: cx('text-muted max-md:hidden', pill.tone === 'failed' && 'border-danger text-danger'),
								})}
								href="/coletas"
								onClick={onLinkClick}
							>
								<StatusDot {...PILL_DOTS[pill.tone]} />
								{pill.text}
							</a>
						)}
						{!connected && (
							<Badge tone="plain" bordered="dashed" className="text-muted" title="Sem conexão em tempo real; reconectando…">
								offline
							</Badge>
						)}
						<IconButton label="Alternar tema claro/escuro" bordered onClick={toggleTheme}>
							<Icon name="moon" className="dark:hidden" />
							<Icon name="sun" className="hidden dark:inline" />
						</IconButton>
					</div>
				</div>
			</header>

			<main id="main" className="flex-1 outline-none" tabIndex={-1}>
				<View path={path} />
			</main>

			<nav
				className="fixed inset-x-0 bottom-0 z-30 hidden grid-cols-4 border-t border-line bg-bg px-2 pt-1 pb-safe-2 max-md:grid"
				aria-label="Principal (celular)"
			>
				{NAV.map(item => (
					<a
						key={item.path}
						className={cx(
							'relative flex min-h-13 flex-col items-center gap-1 pt-2 pb-1 text-xs text-muted no-underline',
							isActive(item.path) && 'font-semibold text-ink',
						)}
						href={item.path}
						aria-current={isActive(item.path) ? 'page' : undefined}
						onClick={onLinkClick}
					>
						<Icon name={item.icon} size={20} />
						{item.label}
						{item.path === '/curriculos' && pendingCvs > 0 && (
							<Badge tone="lime" size="xs" className="absolute top-1 left-1/2 ml-1.5">
								{pendingCvs}
							</Badge>
						)}
					</a>
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
							'pointer-events-auto flex items-center gap-2.5 rounded-md bg-ink py-2 pr-2 pl-3.5 text-sm text-bg shadow-float',
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
