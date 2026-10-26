import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { isJobRouteId } from '../../job-route-id'
import type { JobFilters } from '../api'
import { Icon } from '../components/Icon'
import { JobCard, JobCardSkeleton } from '../components/JobCard'
import { JobDetailSkeleton } from '../components/JobDetail'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Checkbox, SearchInput } from '../components/ui/Input'
import { Hero, Page } from '../components/ui/Page'
import { Pill, PILL_COUNT, PillGroup } from '../components/ui/Pill'
import { PRESS } from '../components/ui/press'
import { RollingNumber } from '../components/ui/RollingNumber'
import { SelectMenu } from '../components/ui/SelectMenu'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusDot } from '../components/ui/StatusDot'
import { FIELDSET, LABEL } from '../components/ui/text'
import { TextLink } from '../components/ui/TextLink'
import { cx } from '../lib/cx'
import { useFiltersDrag } from '../lib/filters-drag'
import { useFlipList } from '../lib/flip-list'
import { CONTRACT_TYPES, LANGUAGE_NAMES, WORK_MODES } from '../lib/format'
import { hasActiveFilters } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { reducedMotion } from '../lib/motion'
import { useStore } from '../lib/store'
import { useTrayRequests } from '../stores/cv'
import { filtersOpen } from '../stores/filters-panel'
import { jobsStore, loadJobs, loadMoreJobs, showIncoming, useJobs } from '../stores/jobs'
import { markAllViewed, useViewedCheck } from '../stores/viewed'

const PERIODS = [
	['24h', '24h'],
	['7d', '7 dias'],
	['30d', '30 dias'],
	['all', 'tudo'],
] as const

const VISIBLE_SKILL_FILTERS = 12

/** `''` é "todos" (sem filtro de idioma). */
const LANGUAGE_OPTIONS = [
	{ value: '', label: 'todos' },
	...Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ value: code, label: `${name} (${code})` })),
]

/**
 * Painel do detalhe da vaga ao lado da lista (desktop): acompanha a rolagem e rola por dentro. Com os filtros fechados,
 * ocupa o espaço deles e cresce junto com a lista. A soma das bases (lista, faixa dos filtros e painel) cabe nos 1100px
 * do layout lado a lado; senão o painel quebraria para baixo da lista.
 */
export function DetailPanel({ children }: { children: ReactNode }) {
	const wider = !useStore(filtersOpen)

	return (
		<aside
			// A vaga clicada na lista acende este painel (`lib/job-opening.ts`)
			data-job-panel
			className={card({
				size: 'lg',
				className: cx(
					'sticky top-19 max-h-below-topbar grow-999 overflow-y-auto transition-all duration-300 ease-out motion-reduce:transition-none',
					wider ? 'max-w-190 basis-130' : 'max-w-115 basis-100',
				),
			})}
			aria-label="Detalhe da vaga"
		>
			{children}
		</aside>
	)
}

const FRESH_GLOW = { delay: 250, duration: 1600 }

/**
 * "N vagas novas": as vagas entram no topo da lista (deslizando, pelo `useFlipList`), a tela sobe até elas e cada uma
 * acende em lime e apaga devagar.
 */
function showIncomingOnTop() {
	const fresh = jobsStore.get().incoming.map(job => job.postId)
	flushSync(showIncoming)
	window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
	if (reducedMotion()) return

	const style = getComputedStyle(document.documentElement)
	const accent = style.getPropertyValue('--color-lime-accent').trim()
	const glow = style.getPropertyValue('--color-lime-glow').trim()
	for (const postId of fresh) {
		document
			.querySelector(`[data-flip-key="${CSS.escape(postId)}"]`)
			?.animate(
				[
					{ borderColor: accent, boxShadow: `0 0 0 3px ${glow}, 0 0 24px ${glow}` },
					{ borderColor: accent, boxShadow: `0 0 0 3px ${glow}, 0 0 24px ${glow}`, offset: 0.3 },
					{},
				],
				{ ...FRESH_GLOW, easing: 'ease-out', fill: 'backwards' },
			)
	}
}

/** A lista com `value` incluído ou removido. */
const toggled = <T extends string>(list: T[], value: T) =>
	list.includes(value) ? list.filter(item => item !== value) : [...list, value]

/** Rolagem infinita: carrega a próxima página quando o fim da lista aparece. */
function observeEnd(el: HTMLDivElement | null) {
	if (!el) return

	const observer = new IntersectionObserver(entries => entries.some(entry => entry.isIntersecting) && loadMoreJobs(), {
		rootMargin: '400px',
	})
	observer.observe(el)

	return () => observer.disconnect()
}

/**
 * Os filtros ficam na URL (o link pode ser compartilhado e recarregar mantém). Cada mudança entra no histórico, e
 * "voltar" desfaz; a busca por texto substitui a entrada, para não criar uma por letra.
 */
function useFilters() {
	const filters = useSearch({ from: '/_vagas' })
	const navigate = useNavigate()

	return {
		filters,
		setFilters: (patch: Partial<JobFilters>) =>
			void navigate({ to: '.', search: previous => ({ ...previous, ...patch }), replace: 'q' in patch }),
		clearFilters: () => void navigate({ to: '.', search: {} }),
	}
}

type FilterChip = { key: string; label: string; remove: Partial<JobFilters> }

/** Os filtros ligados, um por chip, cada um com o que desligá-lo (o resumo que aparece com o painel fechado). */
function activeFilterChips(filters: JobFilters): FilterChip[] {
	return [
		...(filters.q.trim() ? [{ key: 'q', label: `“${filters.q.trim()}”`, remove: { q: '' } }] : []),
		...PERIODS.filter(([value]) => value !== 'all' && value === filters.since).map(([value, label]) => ({
			key: `since-${value}`,
			label,
			remove: { since: 'all' as const },
		})),
		...filters.workMode.map(mode => ({
			key: `workMode-${mode}`,
			label: WORK_MODES[mode].label,
			remove: { workMode: toggled(filters.workMode, mode) },
		})),
		...filters.contractType.map(type => ({
			key: `contractType-${type}`,
			label: CONTRACT_TYPES[type],
			remove: { contractType: toggled(filters.contractType, type) },
		})),
		...filters.skills.map(skill => ({
			key: `skill-${skill}`,
			label: skill,
			remove: { skills: toggled(filters.skills, skill) },
		})),
		...(filters.unviewed ? [{ key: 'unviewed', label: 'só não vistas', remove: { unviewed: false } }] : []),
		...(filters.hasEmail ? [{ key: 'hasEmail', label: 'com e-mail', remove: { hasEmail: false } }] : []),
		...(filters.language
			? [{ key: 'language', label: LANGUAGE_NAMES[filters.language] ?? filters.language, remove: { language: '' } }]
			: []),
	]
}

/** Os filtros ligados em chips (× desliga um), o resumo que aparece com o painel fechado. */
function FilterChips({ className }: { className?: string }) {
	const { filters, setFilters, clearFilters } = useFilters()
	const chips = activeFilterChips(filters)

	if (chips.length === 0) return null
	return (
		<div className={cx('flex flex-wrap items-center gap-1.5', className)}>
			{chips.map(chip => (
				<Pill key={chip.key} aria-label={`remover filtro ${chip.label}`} onClick={() => setFilters(chip.remove)}>
					{chip.label}
					<Icon name="close" size={12} />
				</Pill>
			))}
			{chips.length > 1 && (
				<TextLink className="ml-1.5 text-xs" onClick={clearFilters}>
					limpar
				</TextLink>
			)}
		</div>
	)
}

/** Celular: o botão que abre os filtros (num card que desce abaixo dele) e, fechados, o resumo dos ligados. */
function MobileFiltersBar({ open }: { open: boolean }) {
	const { filters } = useFilters()
	const count = activeFilterChips(filters).length

	return (
		<div className="flex flex-col items-start gap-2.5 md:hidden">
			<Button variant="ghost" aria-expanded={open} aria-controls="filters" onClick={() => filtersOpen.set(!open)}>
				<Icon name="filter" />
				filtros{count > 0 ? ` · ${count}` : ''}
			</Button>
			{!open && <FilterChips />}
		</div>
	)
}

/** A troca do ícone da alça dos filtros: o que sai gira e encolhe, o que entra cresce no lugar. */
const HANDLE_ICON = 'col-start-1 row-start-1 transition duration-300 ease-spring motion-reduce:transition-none'

/**
 * A alça dos filtros (desktop), na borda direita da coluna, acompanhando a rolagem: clicada, abre ou fecha; arrastada,
 * a coluna segue o mouse (`useFiltersDrag`). O ícone mostra o que vai acontecer: o funil abre, a seta fecha.
 */
function FiltersHandle({ open, count, drag }: { open: boolean; count: number; drag: ReturnType<typeof useFiltersDrag> }) {
	const closing = drag.previewOpen

	return (
		<div className="sticky top-19 z-10 h-0 max-md:hidden">
			<IconButton
				bordered
				label={open ? 'esconder filtros' : count > 0 ? `mostrar filtros (${count} ligados)` : 'mostrar filtros'}
				aria-expanded={open}
				aria-controls="filters"
				className={cx('absolute top-0 right-0 touch-none bg-bg', drag.dragging && 'cursor-ew-resize')}
				{...drag.handleProps}
			>
				<Icon name="filter" className={cx(HANDLE_ICON, closing && '-rotate-90 scale-50 opacity-0')} />
				<Icon name="back" className={cx(HANDLE_ICON, !closing && 'rotate-90 scale-50 opacity-0')} />
				{count > 0 && !closing && (
					// A chave remonta o contador quando ele muda: pula de novo
					<span
						key={count}
						className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-ink font-mono text-xs text-bg animate-pop motion-reduce:animate-none"
					>
						{count}
					</span>
				)}
			</IconButton>
		</div>
	)
}

function Filters({ open }: { open: boolean }) {
	const { facets } = useJobs()
	const { filters, setFilters, clearFilters } = useFilters()
	const [allSkills, setAllSkills] = useState(false)
	const aside = useRef<HTMLElement>(null)
	const content = useRef<HTMLDivElement>(null)
	const drag = useFiltersDrag({ aside, content, open, setOpen: filtersOpen.set })
	// Arrastando, o conteúdo aparece (com a opacidade seguindo a largura) mesmo com os filtros ainda fechados
	const expanded = open || drag.dragging

	const skills = facets?.skills ?? []
	const selectedSkills = filters.skills.filter(skill => !skills.some(item => item.name.toLowerCase() === skill.toLowerCase()))
	const visibleSkills = allSkills ? skills : skills.slice(0, VISIBLE_SKILL_FILTERS)

	const count = activeFilterChips(filters).length

	return (
		// Desktop: fechados, viram uma faixa com a alça (que acompanha a rolagem); abertos, a coluna desliza a partir dela. O
		// padding com margem negativa deixa o contorno de foco das pills da borda fora do corte. Celular: card que desce
		// abaixo do botão "filtros"
		<aside
			ref={aside}
			className={cx(
				'relative shrink-0 self-stretch overflow-x-clip transition-all duration-300 ease-out motion-reduce:transition-none md:-mx-1 md:px-1',
				open ? 'md:w-66' : 'md:w-12 max-md:hidden',
				'max-md:rounded-lg max-md:border max-md:border-line max-md:bg-surface max-md:p-4 max-md:starting:-translate-y-2 max-md:starting:opacity-0',
			)}
			aria-label="Filtros"
			id="filters"
		>
			<FiltersHandle open={open} count={count} drag={drag} />

			{/* Fechados, saem do fluxo (sem esticar a página) e somem aos poucos enquanto a coluna encolhe */}
			<div
				ref={content}
				inert={!expanded}
				className={cx(
					'flex w-64 flex-col gap-5.5 transition-all duration-300 ease-out motion-reduce:transition-none max-md:w-auto',
					!expanded && 'invisible absolute top-0 left-1 opacity-0',
				)}
			>
				{/* O lugar da alça, que fica por cima (acompanhando a rolagem) */}
				<div className="flex min-h-10 items-center justify-between gap-3 pr-12 max-md:hidden">
					<span className={LABEL}>filtros</span>
				</div>

				<SearchInput
					label="Buscar vagas"
					value={filters.q}
					onChange={event => setFilters({ q: event.target.value })}
					placeholder="cargo, empresa, tecnologia…"
				/>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>período</legend>
					<PillGroup>
						{PERIODS.map(([value, label]) => (
							<Pill key={value} pressed={filters.since === value} onClick={() => setFilters({ since: value })}>
								{label}
							</Pill>
						))}
					</PillGroup>
				</fieldset>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>modalidade</legend>
					<div className="flex flex-col gap-1.5">
						{(Object.keys(WORK_MODES) as (keyof typeof WORK_MODES)[]).map(mode => (
							<Pill
								key={mode}
								shape="row"
								pressed={filters.workMode.includes(mode)}
								onClick={() => setFilters({ workMode: toggled(filters.workMode, mode) })}
							>
								<StatusDot style={{ background: WORK_MODES[mode].color }} />
								<span className="grow">{WORK_MODES[mode].label}</span>
								{facets && <span className={PILL_COUNT}>{facets.workModes[mode]}</span>}
							</Pill>
						))}
					</div>
				</fieldset>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>regime</legend>
					<PillGroup>
						{(Object.keys(CONTRACT_TYPES) as (keyof typeof CONTRACT_TYPES)[]).map(type => (
							<Pill
								key={type}
								pressed={filters.contractType.includes(type)}
								onClick={() => setFilters({ contractType: toggled(filters.contractType, type) })}
							>
								{CONTRACT_TYPES[type]} {facets && <span className={PILL_COUNT}>{facets.contractTypes[type]}</span>}
							</Pill>
						))}
					</PillGroup>
				</fieldset>

				{(skills.length > 0 || filters.skills.length > 0) && (
					<fieldset className={FIELDSET}>
						<legend className={cx(LABEL, 'mb-2.5')}>tecnologias</legend>
						<PillGroup>
							{selectedSkills.map(skill => (
								<Pill key={skill} pressed onClick={() => setFilters({ skills: toggled(filters.skills, skill) })}>
									{skill}
								</Pill>
							))}
							{visibleSkills.map(skill => {
								const current = filters.skills.find(item => item.toLowerCase() === skill.name.toLowerCase())

								return (
									<Pill
										key={skill.name}
										pressed={current !== undefined}
										onClick={() => setFilters({ skills: toggled(filters.skills, current ?? skill.name) })}
									>
										{skill.name} <span className={PILL_COUNT}>{skill.count}</span>
									</Pill>
								)
							})}
							{skills.length > VISIBLE_SKILL_FILTERS && (
								<Pill shape="dashed" onClick={() => setAllSkills(!allSkills)}>
									{allSkills ? 'menos' : `+ ${skills.length - VISIBLE_SKILL_FILTERS}`}
								</Pill>
							)}
						</PillGroup>
					</fieldset>
				)}

				<div className={cx(FIELDSET, 'gap-3 border-t border-line pt-4 text-sm')}>
					<label className="flex items-center justify-between gap-3">
						<span>
							só não vistas {facets && <span className="font-mono text-muted">{facets.unviewed.toLocaleString('pt-BR')}</span>}
						</span>
						<Checkbox checked={filters.unviewed} onChange={event => setFilters({ unviewed: event.target.checked })} />
					</label>
					<label className="flex items-center justify-between gap-3">
						tem e-mail de contato
						<Checkbox checked={filters.hasEmail} onChange={event => setFilters({ hasEmail: event.target.checked })} />
					</label>
					{/* Fora de um <label>: o clique numa opção da lista contaria como clique no rótulo e reabriria a lista */}
					<div className="flex items-center justify-between gap-3">
						<label htmlFor="language-filter">idioma</label>
						<SelectMenu
							id="language-filter"
							size="sm"
							className="w-40"
							value={filters.language}
							options={LANGUAGE_OPTIONS}
							onChange={language => setFilters({ language })}
						/>
					</div>
				</div>

				{hasActiveFilters(filters) && (
					<Button variant="ghost" onClick={clearFilters}>
						limpar filtros
					</Button>
				)}
			</div>
		</aside>
	)
}

const SKELETONS = [0, 1, 2, 3, 4].map(index => <JobCardSkeleton key={index} index={index} />)

function JobList({ selectedId, keepScroll }: { selectedId: string | null; keepScroll: boolean }) {
	const { jobs, status, error, nextCursor, loadingMore } = useJobs()
	const { filters, clearFilters } = useFilters()
	// Os cards deslizam para o lugar novo ao mudar a lista
	const { list, ghosts } = useFlipList(jobs.map(job => job.postId))

	// A primeira página vem pelo loader da rota (com o pendingComponent); aqui é a recarga ao mudar um filtro. Com vagas na
	// tela, elas ficam (esmaecidas pela seção) até a nova lista chegar, sem piscar a cada letra da busca
	if (status === 'loading' && jobs.length === 0) return SKELETONS

	if (status === 'error') {
		return (
			<EmptyState
				tone="error"
				title="Não consegui carregar as vagas"
				description={error}
				action={
					<Button variant="lime" onClick={loadJobs}>
						tentar de novo
					</Button>
				}
			/>
		)
	}

	if (jobs.length === 0) {
		return hasActiveFilters(filters) ? (
			<EmptyState
				title="Nenhuma vaga com esses filtros"
				description="Tente outra busca ou volte a mostrar todas as vagas."
				action={
					<Button variant="lime" onClick={clearFilters}>
						limpar filtros
					</Button>
				}
			/>
		) : (
			<EmptyState
				title="Nenhuma vaga ainda"
				description="Rode uma coleta: as vagas aparecem aqui assim que a IA terminar de ler os posts."
				action={
					<ButtonLink variant="lime" to="/coletas">
						ir para coletas
					</ButtonLink>
				}
			/>
		)
	}

	return (
		<>
			<div ref={list} className="relative flex flex-col gap-2.5">
				{/* Os cards que saíram da lista somem aqui, por cima do lugar onde estavam (`useFlipList`) */}
				<div ref={ghosts} className="pointer-events-none absolute inset-0" aria-hidden="true" />
				{jobs.map(job => (
					<JobCard key={job.postId} job={job} selected={selectedId === job.postId} keepScroll={keepScroll} />
				))}
			</div>
			{nextCursor ? (
				<div ref={error ? undefined : observeEnd} className="flex flex-col items-center gap-2 py-2">
					{error && (
						<p className="text-sm text-danger" role="alert">
							Não consegui carregar mais vagas: {error}
						</p>
					)}
					<Button variant="ghost" disabled={loadingMore} onClick={loadMoreJobs}>
						{loadingMore ? 'carregando…' : error ? 'tentar de novo' : 'carregar mais vagas'}
					</Button>
				</div>
			) : (
				<p className="font-mono text-muted py-2 text-center text-xs">fim da lista</p>
			)}
		</>
	)
}

const HERO_TITLE = (
	<>
		vagas <Hero.Mono>coletadas.</Hero.Mono>
	</>
)
const HERO_LEAD = 'Posts do LinkedIn lidos pela IA. Abra o post, copie o contato ou gere o currículo.'

/**
 * A tela das vagas na primeira carga (o `pendingComponent` da rota), no formato dela: os filtros (se abertos), os cards
 * e, no desktop, o detalhe ao lado.
 */
export function JobsPending() {
	const wide = useWideLayout()
	const showFilters = useStore(filtersOpen)

	return (
		<Page>
			<Hero title={HERO_TITLE} lead={HERO_LEAD} />
			<div className="flex flex-wrap items-start gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3.5">
				{showFilters && (
					<div className="flex w-66 shrink-0 flex-col gap-5.5 max-md:hidden" aria-hidden="true">
						<Skeleton className="h-10 rounded-pill bg-surface-2" />
						{[4, 3, 6].map(count => (
							<div key={count} className="flex flex-col gap-2.5">
								<Skeleton className="h-3 w-20 rounded-xs bg-surface-2" />
								<div className="flex flex-wrap gap-1.5">
									{Array.from({ length: count }, (_, index) => (
										<Skeleton key={index} className={cx('h-8 rounded-pill bg-surface-2', index % 2 ? 'w-14' : 'w-18')} />
									))}
								</div>
							</div>
						))}
					</div>
				)}
				<section
					className={cx('flex min-w-0 grow-999 flex-col gap-2.5 max-md:basis-auto', showFilters ? 'basis-110' : 'basis-100')}
					aria-label="Lista de vagas"
					aria-busy="true"
				>
					{SKELETONS}
				</section>
				{wide && (
					<DetailPanel>
						<JobDetailSkeleton />
					</DetailPanel>
				)}
			</div>
		</Page>
	)
}

/**
 * Tela principal: filtros, lista para escanear e, no desktop, o detalhe da vaga ao lado (`detail`, que a rota preenche).
 * No desktop a vaga aberta fica na URL (`/vagas/$id`, em `selectedRouteId`): voltar e avançar trocam de vaga e o link
 * pode ser compartilhado.
 */
export function JobsView({ selectedRouteId, detail }: { selectedRouteId: string | null; detail: ReactNode }) {
	const { jobs, status, facets, nextCursor, incoming } = useJobs()
	const wide = useWideLayout()
	const showFilters = useStore(filtersOpen)
	const pendingCvs = useTrayRequests().filter(request => request.status === 'pending').length

	// Destacada na lista: a vaga da URL ou, no desktop sem vaga na URL, a primeira (que o painel mostra)
	const selectedId = selectedRouteId
		? (jobs.find(job => isJobRouteId(job.postId, selectedRouteId))?.postId ?? null)
		: wide
			? (jobs[0]?.postId ?? null)
			: null
	const isViewed = useViewedCheck()
	const unviewedOnScreen = jobs.some(job => !isViewed(job))

	return (
		<Page>
			<Hero
				title={HERO_TITLE}
				lead={HERO_LEAD}
				aside={
					<span className="font-mono text-muted text-sm">
						{facets ? facets.total.toLocaleString('pt-BR') : '–'} no histórico
						{' · '}
						{pendingCvs === 1 ? '1 currículo gerando' : `${pendingCvs} currículos gerando`}
					</span>
				}
			/>

			{incoming.length > 0 && (
				// Cai do topo quando chega a primeira; o número rola a cada vaga nova
				<button
					type="button"
					className={cx(
						'sticky top-19 z-10 inline-flex min-h-10 items-center gap-2.5 self-center rounded-pill border border-line bg-lime-soft py-1.5 pr-4 pl-2 text-sm text-ink shadow-float animate-drop-in motion-reduce:animate-none max-md:top-17.5',
						PRESS,
					)}
					onClick={showIncomingOnTop}
				>
					<Badge tone="lime" size="sm">
						ao vivo
					</Badge>
					<span>
						<RollingNumber value={incoming.length} /> {incoming.length === 1 ? 'vaga nova' : 'vagas novas'}
					</span>
					<span className="font-mono text-xs underline">mostrar no topo</span>
				</button>
			)}

			<MobileFiltersBar open={showFilters} />

			<div className="flex flex-wrap items-start gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3.5">
				<Filters open={showFilters} />

				<section
					className={cx(
						'flex min-w-0 grow-999 flex-col gap-2.5 transition-all duration-300 ease-out motion-reduce:transition-none max-md:basis-auto',
						showFilters ? 'basis-110' : 'basis-100',
						status === 'loading' && jobs.length > 0 && 'opacity-60',
					)}
					aria-label="Lista de vagas"
					aria-busy={status === 'loading'}
				>
					{!showFilters && <FilterChips className="mb-1 max-md:hidden" />}
					{status !== 'error' && jobs.length > 0 && (
						<div className="font-mono text-muted text-xs">
							{jobs.length}
							{nextCursor ? '+' : ''} vagas
							{unviewedOnScreen && (
								<>
									{' · '}
									<TextLink className="text-xs" onClick={() => void markAllViewed(jobs)}>
										marcar todas como vistas
									</TextLink>
								</>
							)}
						</div>
					)}
					<JobList selectedId={wide ? selectedId : null} keepScroll={wide} />
				</section>

				{detail}
			</div>
		</Page>
	)
}
