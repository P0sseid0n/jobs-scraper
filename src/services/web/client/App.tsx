import { useEffect, useState } from 'react'

import type { ScraperStatus } from '../api-types'
import { api } from './api'
import { CvTray } from './components/CvTray'
import { Icon, type IconName } from './components/Icon'
import { ProjectIcon } from './components/ProjectIcon'
import { cx } from './lib/cx'
import { formatDuration } from './lib/format'
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
	if (status.current) return { tone: 'running', text: 'coletando agora' }
	if (status.last?.status === 'failed') return { tone: 'failed', text: 'última coleta falhou' }
	if (status.paused) return { tone: 'paused', text: 'coletas pausadas' }

	const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : 0
	return {
		tone: 'idle',
		text: next > 60_000 ? `próxima em ${formatDuration(next).replace(/ \d+s$/, '')}` : 'próxima a qualquer momento',
	}
}

function View({ path }: { path: string }) {
	const job = matchPath('/vagas/:postId', path)
	if (job?.postId) return <JobPage postId={job.postId} />

	switch (path.replace(/\/$/, '') || '/') {
		case '/':
			return <JobsView />
		case '/curriculos':
			return <CvsView />
		case '/coletas':
			return <RunsView />
		case '/configuracoes':
			return <SettingsView />
		default:
			return (
				<div className="page page-narrow">
					<div className="card empty">
						<p className="strong">Página não encontrada</p>
						<a className="btn btn-lime" href="/" onClick={onLinkClick}>
							ver vagas
						</a>
					</div>
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
					<a className="logo mono" href="/" onClick={onLinkClick}>
						<ProjectIcon />
						jobs/scraper<span className="logo-cursor">_</span>
					</a>
					<nav className="topnav" aria-label="Principal">
						{NAV.map(item => (
							<a
								key={item.path}
								className={cx('navlink', isActive(item.path) && 'active')}
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
							<a className={cx('status-pill mono', `pill-${pill.tone}`)} href="/coletas" onClick={onLinkClick}>
								<span className="dot" />
								{pill.text}
							</a>
						)}
						{!connected && (
							<span className="mono xsmall muted offline" title="Sem conexão em tempo real; reconectando…">
								offline
							</span>
						)}
						<button type="button" className="icon-btn bordered" aria-label="Alternar tema claro/escuro" onClick={toggleTheme}>
							<Icon name="moon" className="theme-moon" />
							<Icon name="sun" className="theme-sun" />
						</button>
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
						className={cx('bottomnav-item', isActive(item.path) && 'active')}
						href={item.path}
						aria-current={isActive(item.path) ? 'page' : undefined}
						onClick={onLinkClick}
					>
						<Icon name={item.icon} size={20} />
						{item.label}
						{item.path === '/curriculos' && pendingCvs > 0 && <span className="badge mono">{pendingCvs}</span>}
					</a>
				))}
			</nav>

			<CvTray />

			<div className="toasts" aria-live="polite">
				{toasts.map(toast => (
					<div key={toast.id} className={cx('toast', `toast-${toast.tone}`)} role={toast.tone === 'error' ? 'alert' : 'status'}>
						<span className="grow">{toast.message}</span>
						<button type="button" className="icon-btn" aria-label="Fechar aviso" onClick={() => dismissToast(toast.id)}>
							<Icon name="close" size={14} />
						</button>
					</div>
				))}
			</div>
		</div>
	)
}
