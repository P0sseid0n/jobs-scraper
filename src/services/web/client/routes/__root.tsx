import { createRootRoute, Link, Outlet, redirect, useMatches, useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { REQUIRED_SETUP_STEPS, type ScraperStatus, type SetupStatus } from '../../api-types'
import { api } from '../api'
import { CvTray } from '../components/CvTray'
import { Icon, type IconName } from '../components/Icon'
import { LanguageSelect } from '../components/LanguageSelect'
import { LinkedinVerificationDialog } from '../components/LinkedinVerificationDialog'
import { Logo } from '../components/Logo'
import { Toasts } from '../components/Toasts'
import { Badge, badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Page, pageFrame } from '../components/ui/Page'
import { useSlidingIndicator } from '../components/ui/sliding-indicator'
import { StatusDot, type StatusDotTone } from '../components/ui/StatusDot'
import { cx } from '../lib/cx'
import { formatDuration, formatList } from '../lib/format'
import { reducedMotion } from '../lib/motion'
import { useTrayRequests } from '../stores/cv'
import { jobsStore } from '../stores/jobs'
import { onLive, useConnected } from '../stores/live'
import { useT } from '../stores/locale'
import { loadSetup, needsOnboarding, useSetup } from '../stores/setup'
import { toggleTheme } from '../stores/theme'
import { useToasts } from '../stores/toast'

/**
 * A moldura de todas as telas: cabeçalho, navegação, bandeja de currículos e avisos. Enquanto falta o mínimo (perfil,
 * LinkedIn e currículo), qualquer tela leva ao onboarding (`/onboarding`), que tem uma tela só dele, sem o cabeçalho.
 */
export const Route = createRootRoute({
	beforeLoad: async ({ location }) => {
		if (isOnboarding(location.pathname)) return
		if (needsOnboarding(await loadSetup())) throw redirect({ to: '/onboarding' })
	},
	component: RootLayout,
	notFoundComponent: NotFound,
})

const isOnboarding = (path: string) => path === '/onboarding' || path.startsWith('/onboarding/')

/** O que falta do mínimo, em texto ("a conta do LinkedIn e o currículo"); vazio se nada falta. */
function missingSetup(setup: SetupStatus | null, names: Record<(typeof REQUIRED_SETUP_STEPS)[number], string>) {
	return formatList(setup ? REQUIRED_SETUP_STEPS.filter(step => !setup.steps[step]).map(step => names[step]) : [])
}

/** As telas do menu; o nome de cada uma fica em `layout.nav` do catálogo. */
const NAV = [
	{ path: '/', label: 'jobs', icon: 'briefcase' },
	{ path: '/resumes', label: 'cvs', icon: 'file' },
	{ path: '/runs', label: 'runs', icon: 'refresh' },
	{ path: '/settings', label: 'settings', icon: 'settings' },
] as const satisfies readonly { path: string; label: string; icon: IconName }[]

/** Voltar para a lista mantém os últimos filtros usados. */
const lastFilters = () => jobsStore.get().filters

const PILL_DOTS: Record<'running' | 'failed' | 'paused' | 'idle' | 'offline', { tone: StatusDotTone; glow?: boolean }> = {
	running: { tone: 'lime', glow: true },
	failed: { tone: 'current' },
	paused: { tone: 'muted' },
	idle: { tone: 'ok' },
	offline: { tone: 'muted' },
}

/**
 * Status do scraper no cabeçalho, atualizado a cada 30 s. Sem a conexão em tempo real, mostra "offline" no lugar: o
 * status na tela pode estar velho, e as vagas novas não chegam. Ao reconectar, consulta na hora.
 */
function useScraperPill() {
	const [status, setStatus] = useState<ScraperStatus | null>(null)
	const [now, setNow] = useState(Date.now())
	const connected = useConnected()
	const pill = useT().layout.pill

	useEffect(() => {
		let active = true
		const refresh = () =>
			api.scraperStatus().then(
				value => active && setStatus(value),
				() => active && setStatus(null),
			)

		// Refeito quando a conexão em tempo real cai ou volta: ao voltar, pega o que mudou durante a queda (eventos perdidos)
		void refresh()
		const timer = setInterval(() => {
			setNow(Date.now())
			void refresh()
		}, 30_000)
		// Coleta que começou ou terminou (inclusive pedida pelo terminal ou pelo Discord): consulta na hora
		const stop = onLive('scraperRun', () => void refresh())

		return () => {
			active = false
			clearInterval(timer)
			stop()
		}
	}, [connected])

	if (!connected) return { tone: 'offline' as const, text: pill.offline }
	if (!status) return null
	if (status.current) return { tone: 'running' as const, text: pill.running }
	if (status.last?.status === 'failed') return { tone: 'failed' as const, text: pill.failed }
	if (status.paused) return { tone: 'paused' as const, text: pill.paused }
	if (status.activeSearchTerms === 0) return { tone: 'paused' as const, text: pill.noTerms }
	if (!status.linkedinAccount) return { tone: 'paused' as const, text: pill.connectLinkedin }
	if (status.awaitingFirstRun) return { tone: 'paused' as const, text: pill.firstRun }

	const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : 0
	return {
		tone: 'idle' as const,
		text: next > 60_000 ? pill.nextIn(formatDuration(next).replace(/ \d+s$/, '')) : pill.nextAnyTime,
	}
}

function NotFound() {
	const t = useT()
	return (
		<Page width="narrow">
			<EmptyState
				illustration="lost"
				title={t.layout.notFound}
				action={
					<ButtonLink variant="lime" to="/">
						{t.layout.seeJobs}
					</ButtonLink>
				}
			/>
		</Page>
	)
}

function RootLayout() {
	const path = useRouterState({ select: state => state.location.pathname })
	const t = useT()
	// O título da rota mais funda (o `staticData.title` de cada arquivo de `routes/`)
	const title = useMatches({ select: matches => matches.at(-1)?.staticData.title })
	const pill = useScraperPill()
	const toasts = useToasts()
	const pendingCvs = useTrayRequests().filter(request => request.status === 'pending').length
	const nav = useSlidingIndicator<HTMLElement>('[aria-current="page"]', path)
	const navPill = useJellyOnSlide(nav.box)
	const missing = missingSetup(useSetup(), t.layout.setupNames)

	// "vagas" também fica marcado com uma vaga aberta (`/jobs/$id`)
	const isActive = (item: string) => (item === '/' ? path === '/' || path.startsWith('/jobs/') : path.startsWith(item))
	const page = usePageTransition(NAV.findIndex(item => isActive(item.path)))

	useEffect(() => {
		document.title = `${title ? t.routes.titles[title] : 'Jobs Scraper'} · jobs/scraper`
	}, [title, t])

	if (isOnboarding(path)) {
		return (
			<>
				<Outlet />
				<LinkedinVerificationDialog />
				<Toasts toasts={toasts} />
			</>
		)
	}

	return (
		<div className="relative isolate flex min-h-dvh flex-col">
			{/* O degradê do topo, mais ao fundo: desce mais devagar que a rolagem e some (`parallax-glow`) */}
			<div aria-hidden="true" className="parallax-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-120" />
			<a className="absolute -top-15 left-3 z-50 rounded-pill bg-lime px-3.5 py-2.5 text-lime-ink focus:top-3" href="#main">
				{t.layout.skipToContent}
			</a>
			<header className="sticky top-0 z-20 border-b border-line bg-bg/88 backdrop-blur-md">
				<div className={pageFrame({ className: 'flex items-center gap-4 py-3' })}>
					<Link className="no-underline" to="/" search={lastFilters}>
						<Logo />
					</Link>
					<nav ref={nav.container} className="relative flex flex-auto gap-1 max-md:hidden" aria-label={t.layout.mainNav}>
						{/* O fundo da tela atual, que desliza até a nova */}
						{nav.box && (
							<span
								ref={navPill}
								aria-hidden="true"
								className={cx(
									'pointer-events-none absolute inset-y-0 left-0 rounded-pill bg-surface-2',
									nav.box.slide && 'transition-all duration-500 ease-glide motion-reduce:transition-none',
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
								{item.path === '/settings' ? t.layout.nav.settingsLong : t.layout.nav[item.label]}
							</Link>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-2.5">
						{pill && (
							<Link
								className={badge({
									tone: 'plain',
									size: 'lg',
									bordered: pill.tone === 'offline' ? 'dashed' : true,
									// O "offline" continua no celular: avisa que as vagas novas não estão chegando
									className: cx(
										'text-muted',
										pill.tone !== 'offline' && 'max-md:hidden',
										pill.tone === 'failed' && 'border-danger text-danger',
									),
								})}
								title={pill.tone === 'offline' ? t.layout.pill.offlineTitle : undefined}
								to="/runs"
							>
								<StatusDot {...PILL_DOTS[pill.tone]} />
								{pill.text}
							</Link>
						)}
						<LanguageSelect id="header-locale" size="sm" invite={false} className="max-md:hidden" />
						<IconButton label={t.common.toggleTheme} variant="ghost" onClick={event => toggleTheme(event.currentTarget)}>
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

			{/* Com SKIP_ONBOARDING, ou se algo deixou de estar configurado depois: o aviso no lugar do onboarding */}
			{missing && (
				<div className="border-b border-line bg-warn-bg text-warn">
					<div className={pageFrame({ className: 'flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm' })}>
						<Icon name="alert" />
						<p className="grow">{t.layout.missingSetup(missing)}</p>
						<Link className="font-semibold text-warn underline underline-offset-2" to="/onboarding">
							{t.layout.setupNow}
						</Link>
					</div>
				</div>
			)}

			{/* `clip` (e não `hidden`): a tela entrando de lado não abre rolagem horizontal, e o `sticky` continua funcionando */}
			<main id="main" className="flex-1 overflow-x-clip outline-none" tabIndex={-1}>
				{/* Trocando de aba no menu, a tela nova entra pelo lado dela (a chave remonta só entre abas, não entre vagas) */}
				<div
					key={page.section}
					className={cx(
						page.direction === 'next' && 'animate-page-next',
						page.direction === 'back' && 'animate-page-back',
						'motion-reduce:animate-none',
					)}
					// Terminada, a animação sai: um `transform` parado no fim prenderia os `fixed` da tela (a barra de salvar) nela
					onAnimationEnd={event => event.target === event.currentTarget && page.settle()}
				>
					<Outlet />
				</div>
			</main>

			<nav
				className="fixed inset-x-0 bottom-0 z-30 hidden grid-cols-4 border-t border-line bg-bg px-2 pt-1 pb-safe-2 max-md:grid"
				aria-label={t.layout.mobileNav}
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
						{t.layout.nav[item.label]}
						{item.path === '/resumes' && pendingCvs > 0 && (
							<Badge tone="lime" size="xs" className="absolute top-1 left-1/2 ml-1.5">
								{pendingCvs}
							</Badge>
						)}
					</Link>
				))}
			</nav>

			<CvTray />

			<LinkedinVerificationDialog />

			<Toasts toasts={toasts} />
		</div>
	)
}

/**
 * O fundo da aba do menu, enquanto desliza até a nova: estica na direção do movimento e, ao chegar, se acomoda com
 * mola (como geleia), em vez de só deslizar.
 */
function useJellyOnSlide(box: { left: number; slide: boolean } | null) {
	const pill = useRef<HTMLSpanElement>(null)
	const lastLeft = useRef(box?.left)

	useEffect(() => {
		const from = lastLeft.current
		lastLeft.current = box?.left
		if (!box?.slide || from === undefined || from === box.left || !pill.current || reducedMotion()) return

		pill.current.animate(
			[{ scale: '1 1' }, { scale: '1.25 0.85', offset: 0.35 }, { scale: '0.94 1.06', offset: 0.7 }, { scale: '1 1' }],
			{
				duration: 600,
				easing: 'ease-out',
			},
		)
	}, [box?.left, box?.slide])

	return pill
}

/**
 * A aba do menu na tela (`section`, o índice em `NAV`; -1 fora dele) e de que lado a tela nova entra: pela direita
 * vindo de uma aba à esquerda, e ao contrário. Na primeira tela, sem animação.
 */
function usePageTransition(section: number) {
	const [page, setPage] = useState<{ section: number; direction: 'next' | 'back' | null }>({ section, direction: null })
	// Guardado no estado (e não calculado a cada render): outro render no meio não corta a animação
	if (page.section !== section) setPage({ section, direction: section > page.section ? 'next' : 'back' })

	return { ...page, settle: () => setPage(current => ({ ...current, direction: null })) }
}
