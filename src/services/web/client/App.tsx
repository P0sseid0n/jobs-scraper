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
				<div className="page page-narrow">
					<EmptyState
						title="Página não encontrada"
						action={
							<Button variant="lime" href="/" onClick={onLinkClick}>
								ver vagas
							</Button>
						}
					/>
				</div>
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
		<div className="app">
			<a className="skip-link" href="#main">
				pular para o conteúdo
			</a>
			<header className="topbar">
				<div className="topbar-inner">
					<a className="logo mono text-sm" href="/" onClick={onLinkClick}>
						<ProjectIcon />
						jobs/scraper<span className="logo-cursor">_</span>
					</a>
					<nav className="topnav" aria-label="Principal">
						{NAV.map(item => (
							<a
								key={item.path}
								className={cx('navlink text-sm', isActive(item.path) && 'active')}
								href={item.path}
								aria-current={isActive(item.path) ? 'page' : undefined}
								onClick={onLinkClick}
							>
								{item.path === '/configuracoes' ? 'configurações' : item.label}
							</a>
						))}
					</nav>
					<div className="topbar-tools">
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
							<Icon name="moon" className="theme-moon" />
							<Icon name="sun" className="theme-sun" />
						</IconButton>
					</div>
				</div>
			</header>

			<main id="main" tabIndex={-1}>
				<View path={path} />
			</main>

			<nav className="bottomnav" aria-label="Principal (celular)">
				{NAV.map(item => (
					<a
						key={item.path}
						className={cx('bottomnav-item text-xs', isActive(item.path) && 'active')}
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

			<div className="toasts" aria-live="polite">
				{toasts.map(toast => (
					<div
						key={toast.id}
						className={cx('toast text-sm', `toast-${toast.tone}`)}
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
