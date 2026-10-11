import { computed, defineComponent, onMounted, onUnmounted, ref, watchEffect } from 'vue'

import type { ScraperStatus } from '../api-types'
import { api } from './api'
import { CvTray } from './components/CvTray'
import { Icon, type IconName } from './components/Icon'
import { formatDuration } from './lib/format'
import { matchPath, onLinkClick, route } from './router'
import { trayRequests } from './stores/cv'
import { connected } from './stores/live'
import { toggleTheme } from './stores/theme'
import { dismissToast, toasts } from './stores/toast'
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
	const status = ref<ScraperStatus | null>(null)
	const now = ref(Date.now())

	const refresh = () =>
		api
			.scraperStatus()
			.then(value => (status.value = value))
			.catch(() => (status.value = null))

	let timer: ReturnType<typeof setInterval> | undefined
	onMounted(() => {
		void refresh()
		timer = setInterval(() => {
			now.value = Date.now()
			void refresh()
		}, 30_000)
	})
	onUnmounted(() => clearInterval(timer))

	return computed(() => {
		const s = status.value
		if (!s) return null
		if (s.current) return { tone: 'running', text: 'coletando agora' }
		if (s.last?.status === 'failed') return { tone: 'failed', text: 'última coleta falhou' }
		if (s.paused) return { tone: 'paused', text: 'coletas pausadas' }

		const next = s.nextRunAt ? new Date(s.nextRunAt).getTime() - now.value : 0
		return {
			tone: 'idle',
			text: next > 60_000 ? `próxima em ${formatDuration(next).replace(/ \d+s$/, '')}` : 'próxima a qualquer momento',
		}
	})
}

export const App = defineComponent({
	name: 'App',
	setup() {
		const pill = useScraperPill()

		const view = computed(() => {
			const job = matchPath('/vagas/:postId')
			if (job?.postId) return <JobPage postId={job.postId} />

			switch (route.path.replace(/\/$/, '') || '/') {
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
						<div class="page page-narrow">
							<div class="card empty">
								<p class="strong">Página não encontrada</p>
								<a class="btn btn-lime" href="/" onClick={onLinkClick}>
									ver vagas
								</a>
							</div>
						</div>
					)
			}
		})

		const isActive = (path: string) =>
			path === '/' ? route.path === '/' || route.path.startsWith('/vagas/') : route.path.startsWith(path)

		const pendingCvs = computed(() => trayRequests.value.filter(request => request.status === 'pending').length)

		watchEffect(() => {
			document.title = `${TITLES[route.path] ?? (route.path.startsWith('/vagas/') ? 'Vaga' : 'Jobs Scraper')} · jobs/scraper`
		})

		return () => {
			return (
				<div class="app">
					<a class="skip-link" href="#main">
						pular para o conteúdo
					</a>
					<header class="topbar">
						<div class="topbar-inner">
							<a class="logo mono" href="/" onClick={onLinkClick}>
								jobs/scraper<span class="logo-cursor">_</span>
							</a>
							<nav class="topnav" aria-label="Principal">
								{NAV.map(item => (
									<a
										key={item.path}
										class={['navlink', isActive(item.path) && 'active']}
										href={item.path}
										aria-current={isActive(item.path) ? 'page' : undefined}
										onClick={onLinkClick}
									>
										{item.path === '/configuracoes' ? 'configurações' : item.label}
									</a>
								))}
							</nav>
							<div class="topbar-tools">
								{pill.value && (
									<a class={['status-pill mono', `pill-${pill.value.tone}`]} href="/coletas" onClick={onLinkClick}>
										<span class="dot" />
										{pill.value.text}
									</a>
								)}
								{!connected.value && (
									<span class="mono xsmall muted offline" title="Sem conexão em tempo real; reconectando…">
										offline
									</span>
								)}
								<button type="button" class="icon-btn bordered" aria-label="Alternar tema claro/escuro" onClick={toggleTheme}>
									<Icon name="moon" class="theme-moon" />
									<Icon name="sun" class="theme-sun" />
								</button>
							</div>
						</div>
					</header>

					<main id="main" tabindex={-1}>
						{view.value}
					</main>

					<nav class="bottomnav" aria-label="Principal (celular)">
						{NAV.map(item => (
							<a
								key={item.path}
								class={['bottomnav-item', isActive(item.path) && 'active']}
								href={item.path}
								aria-current={isActive(item.path) ? 'page' : undefined}
								onClick={onLinkClick}
							>
								<Icon name={item.icon} size={20} />
								{item.label}
								{item.path === '/curriculos' && pendingCvs.value > 0 && <span class="badge mono">{pendingCvs.value}</span>}
							</a>
						))}
					</nav>

					<CvTray />

					<div class="toasts" aria-live="polite">
						{toasts.value.map(toast => (
							<div key={toast.id} class={['toast', `toast-${toast.tone}`]} role={toast.tone === 'error' ? 'alert' : 'status'}>
								<span class="grow">{toast.message}</span>
								<button type="button" class="icon-btn" aria-label="Fechar aviso" onClick={() => dismissToast(toast.id)}>
									<Icon name="close" size={14} />
								</button>
							</div>
						))}
					</div>
				</div>
			)
		}
	},
})
