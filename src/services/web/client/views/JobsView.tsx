import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'

import { isJobRouteId } from '../../job-route-id'
import type { JobFilters } from '../api'
import { Icon } from '../components/Icon'
import { JobCard, JobCardSkeleton } from '../components/JobCard'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { Checkbox, Range, SearchInput, Select } from '../components/ui/Input'
import { Hero, Page } from '../components/ui/Page'
import { Pill, PILL_COUNT, PillGroup } from '../components/ui/Pill'
import { StatusDot } from '../components/ui/StatusDot'
import { FIELDSET, LABEL } from '../components/ui/text'
import { TextLink } from '../components/ui/TextLink'
import { cx } from '../lib/cx'
import { CONTRACT_TYPES, LANGUAGE_NAMES, WORK_MODES } from '../lib/format'
import { hasActiveFilters } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { useStore } from '../lib/store'
import { useTrayRequests } from '../stores/cv'
import { filtersOpen } from '../stores/filters-panel'
import { loadJobs, loadMoreJobs, showIncoming, useJobs } from '../stores/jobs'
import { markAllViewed, useViewedCheck } from '../stores/viewed'

const PERIODS = [
	['24h', '24h'],
	['7d', '7 dias'],
	['30d', '30 dias'],
	['all', 'tudo'],
] as const

const VISIBLE_SKILL_FILTERS = 12

/**
 * Painel do detalhe da vaga ao lado da lista (desktop): acompanha a rolagem e rola por dentro. Com os filtros fechados,
 * ocupa o espaço deles e cresce junto com a lista. A soma das bases (lista, faixa dos filtros e painel) cabe nos 1100px
 * do layout lado a lado; senão o painel quebraria para baixo da lista.
 */
export function DetailPanel({ children }: { children: ReactNode }) {
	const wider = !useStore(filtersOpen)

	return (
		<aside
			className={card({
				className: cx(
					'sticky top-19 max-h-below-topbar grow-999 overflow-y-auto p-6 transition-all duration-300 ease-out motion-reduce:transition-none',
					wider ? 'max-w-190 basis-130' : 'max-w-115 basis-100',
				),
			})}
			aria-label="Detalhe da vaga"
		>
			{children}
		</aside>
	)
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
		...(filters.minConfidence > 0
			? [{ key: 'minConfidence', label: `confiança ≥ ${filters.minConfidence}%`, remove: { minConfidence: 0 } }]
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

function Filters({ open }: { open: boolean }) {
	const { facets } = useJobs()
	const { filters, setFilters, clearFilters } = useFilters()
	const [allSkills, setAllSkills] = useState(false)

	const skills = facets?.skills ?? []
	const selectedSkills = filters.skills.filter(skill => !skills.some(item => item.name.toLowerCase() === skill.toLowerCase()))
	const visibleSkills = allSkills ? skills : skills.slice(0, VISIBLE_SKILL_FILTERS)

	const count = activeFilterChips(filters).length

	return (
		// Desktop: fechados, viram uma faixa com o botão (que acompanha a rolagem); abertos, a coluna desliza a partir dela. O
		// padding com margem negativa deixa o contorno de foco das pills da borda fora do corte. Celular: card que desce
		// abaixo do botão "filtros"
		<aside
			className={cx(
				'relative shrink-0 self-stretch overflow-x-clip transition-all duration-300 ease-out motion-reduce:transition-none md:-mx-1 md:px-1',
				open ? 'md:w-66' : 'md:w-12 max-md:hidden',
				'max-md:rounded-lg max-md:border max-md:border-line max-md:bg-surface max-md:p-4 max-md:starting:-translate-y-2 max-md:starting:opacity-0',
			)}
			aria-label="Filtros"
			id="filters"
		>
			{!open && (
				<IconButton
					bordered
					label={count > 0 ? `mostrar filtros (${count} ligados)` : 'mostrar filtros'}
					aria-expanded={false}
					className="sticky top-19 max-md:hidden"
					onClick={() => filtersOpen.set(true)}
				>
					<Icon name="filter" />
					{count > 0 && (
						<span className="absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full bg-ink font-mono text-xs text-bg">
							{count}
						</span>
					)}
				</IconButton>
			)}

			{/* Fechados, saem do fluxo (sem esticar a página) e somem aos poucos enquanto a coluna encolhe */}
			<div
				inert={!open}
				className={cx(
					'flex w-64 flex-col gap-5.5 transition-all duration-300 ease-out motion-reduce:transition-none max-md:w-auto',
					!open && 'invisible absolute top-0 left-1 opacity-0',
				)}
			>
				<div className="flex items-center justify-between gap-3 max-md:hidden">
					<span className={LABEL}>filtros_</span>
					<IconButton size="sm" label="esconder filtros" aria-expanded onClick={() => filtersOpen.set(false)}>
						<Icon name="back" />
					</IconButton>
				</div>

				<SearchInput
					label="Buscar vagas"
					value={filters.q}
					onChange={event => setFilters({ q: event.target.value })}
					placeholder="cargo, empresa, tecnologia…"
				/>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>período_</legend>
					<PillGroup>
						{PERIODS.map(([value, label]) => (
							<Pill key={value} pressed={filters.since === value} onClick={() => setFilters({ since: value })}>
								{label}
							</Pill>
						))}
					</PillGroup>
				</fieldset>

				<fieldset className={FIELDSET}>
					<legend className={cx(LABEL, 'mb-2.5')}>modalidade_</legend>
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
					<legend className={cx(LABEL, 'mb-2.5')}>regime_</legend>
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
						<legend className={cx(LABEL, 'mb-2.5')}>tecnologias_</legend>
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
					<label className="flex items-center justify-between gap-3">
						idioma
						<Select size="sm" value={filters.language} onChange={event => setFilters({ language: event.target.value })}>
							<option value="">todos</option>
							{Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
								<option value={code} key={code}>
									{name} ({code})
								</option>
							))}
						</Select>
					</label>
					<label className="flex flex-col gap-1.5">
						<span className="flex items-center justify-between gap-3">
							confiança mínima <span className="font-mono">{filters.minConfidence}%</span>
						</span>
						<Range
							min={0}
							max={100}
							step={5}
							value={filters.minConfidence}
							aria-valuetext={`${filters.minConfidence}%`}
							onChange={event => setFilters({ minConfidence: Number(event.target.value) })}
						/>
					</label>
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

function JobList({ selectedId, keepScroll }: { selectedId: string | null; keepScroll: boolean }) {
	const { jobs, status, error, nextCursor, loadingMore } = useJobs()
	const { filters, clearFilters } = useFilters()

	// A primeira página vem pelo loader da rota (com o pendingComponent); aqui é a recarga ao mudar um filtro. Com vagas na
	// tela, elas ficam (esmaecidas pela seção) até a nova lista chegar, sem piscar a cada letra da busca
	if (status === 'loading' && jobs.length === 0) {
		return [1, 2, 3, 4, 5].map(key => <JobCardSkeleton key={key} />)
	}

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
			{jobs.map(job => (
				<JobCard key={job.postId} job={job} selected={selectedId === job.postId} keepScroll={keepScroll} />
			))}
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
				title={
					<>
						vagas <Hero.Mono>coletadas.</Hero.Mono>
					</>
				}
				lead="Posts do LinkedIn lidos pela IA. Abra o post, copie o contato ou gere o currículo."
				aside={
					<span className="font-mono text-muted text-sm">
						{facets ? facets.total.toLocaleString('pt-BR') : '–'} no histórico
						{' · '}
						{pendingCvs === 1 ? '1 currículo gerando' : `${pendingCvs} currículos gerando`}
					</span>
				}
			/>

			{incoming.length > 0 && (
				<button
					type="button"
					className="sticky top-19 z-10 inline-flex min-h-10 items-center gap-2.5 self-center rounded-pill border border-line bg-lime-soft py-1.5 pr-4 pl-2 text-sm text-ink shadow-float max-md:top-17.5"
					onClick={showIncoming}
				>
					<Badge tone="lime" size="sm">
						ao vivo
					</Badge>
					{incoming.length === 1 ? '1 vaga nova' : `${incoming.length} vagas novas`}
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
