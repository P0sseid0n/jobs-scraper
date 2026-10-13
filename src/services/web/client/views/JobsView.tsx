import { useEffect, useState } from 'react'

import type { WebJob } from '../../api-types'
import { isJobRouteId } from '../../job-route-id'
import { Icon } from '../components/Icon'
import { JobCard, JobCardSkeleton } from '../components/JobCard'
import { JobDetail } from '../components/JobDetail'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Checkbox, Range, SearchInput, Select } from '../components/ui/Input'
import { Hero, Page } from '../components/ui/Page'
import { Pill, PILL_COUNT, PillGroup } from '../components/ui/Pill'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusDot } from '../components/ui/StatusDot'
import { FIELDSET, LABEL } from '../components/ui/text'
import { cx } from '../lib/cx'
import { CONTRACT_TYPES, LANGUAGE_NAMES, WORK_MODES } from '../lib/format'
import { hasActiveFilters } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { jobPath, navigate, onLinkClick } from '../router'
import { useTrayRequests } from '../stores/cv'
import { clearFilters, loadJobs, loadMoreJobs, setFilters, showIncoming, startJobs, useJobs } from '../stores/jobs'
import { markSeen } from '../stores/seen'
import { useJob } from './JobPage'

const PERIODS = [
	['24h', '24h'],
	['7d', '7 dias'],
	['30d', '30 dias'],
	['all', 'tudo'],
] as const

const VISIBLE_SKILL_FILTERS = 12

/** Painel do detalhe da vaga ao lado da lista (desktop): acompanha a rolagem e rola por dentro. */
const DETAIL_PANEL = card({ className: 'sticky top-19 max-h-below-topbar max-w-115 flex-1 basis-100 overflow-y-auto p-6' })

/** A lista com `value` incluído ou removido. */
const toggled = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value])

/** Rolagem infinita: carrega a próxima página quando o fim da lista aparece. */
function observeEnd(el: HTMLDivElement | null) {
	if (!el) return

	const observer = new IntersectionObserver(entries => entries.some(entry => entry.isIntersecting) && loadMoreJobs(), {
		rootMargin: '400px',
	})
	observer.observe(el)

	return () => observer.disconnect()
}

function Filters({ open }: { open: boolean }) {
	const { filters, facets } = useJobs()
	const [allSkills, setAllSkills] = useState(false)

	const skills = facets?.skills ?? []
	const selectedSkills = filters.skills.filter(skill => !skills.some(item => item.name.toLowerCase() === skill.toLowerCase()))
	const visibleSkills = allSkills ? skills : skills.slice(0, VISIBLE_SKILL_FILTERS)

	return (
		// No celular os filtros ficam recolhidos num card, abertos pelo botão "filtros"
		<aside
			className={cx(
				'flex max-w-67.5 flex-1 basis-60 flex-col gap-5.5 max-lg:max-w-none max-md:rounded-lg max-md:border max-md:border-line max-md:bg-surface max-md:p-4',
				!open && 'max-md:hidden',
			)}
			aria-label="Filtros"
			id="filters"
		>
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
						onChange={event => setFilters({ minConfidence: Number(event.target.value) })}
					/>
				</label>
			</div>

			{hasActiveFilters(filters) && (
				<Button variant="ghost" onClick={clearFilters}>
					limpar filtros
				</Button>
			)}
		</aside>
	)
}

function JobList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (job: WebJob) => void }) {
	const { jobs, status, error, filters, nextCursor, loadingMore } = useJobs()

	if (status === 'loading') {
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
					<Button variant="lime" href="/coletas" onClick={onLinkClick}>
						ir para coletas
					</Button>
				}
			/>
		)
	}

	return (
		<>
			{jobs.map(job => (
				<JobCard key={job.postId} job={job} selected={selectedId === job.postId} onSelect={onSelect} />
			))}
			{nextCursor ? (
				<div ref={observeEnd} className="flex justify-center py-2">
					<Button variant="ghost" disabled={loadingMore} onClick={loadMoreJobs}>
						{loadingMore ? 'carregando…' : 'carregar mais vagas'}
					</Button>
				</div>
			) : (
				<p className="font-mono text-muted py-2 text-center text-xs">fim da lista</p>
			)}
		</>
	)
}

/**
 * Tela principal: filtros, lista para escanear e, no desktop, o detalhe da vaga ao lado. No desktop a vaga aberta fica
 * na URL (`/vagas/:id`, em `selectedRouteId`): voltar e avançar trocam de vaga e o link pode ser compartilhado.
 */
export function JobsView({ selectedRouteId }: { selectedRouteId: string | null }) {
	const { jobs, status, facets, filters, nextCursor, incoming } = useJobs()
	const wide = useWideLayout()
	const tray = useTrayRequests()
	const [filtersOpen, setFiltersOpen] = useState(false)
	// Fora da lista carregada (link direto para uma vaga antiga), a vaga vem da API
	const routeJob = useJob(selectedRouteId)

	useEffect(startJobs, [])

	const selected = selectedRouteId
		? (jobs.find(job => isJobRouteId(job.postId, selectedRouteId)) ?? routeJob.job ?? undefined)
		: wide
			? jobs[0]
			: undefined
	const pendingCvs = tray.filter(request => request.status === 'pending').length

	function select(job: WebJob) {
		markSeen(job.postId)
		// No desktop a lista continua na tela: troca só a vaga do painel, sem voltar ao topo
		navigate(jobPath(job.postId), { scroll: !wide })
	}

	return (
		<Page>
			<Hero
				title={
					<>
						vagas de front-end,
						<br />
						<Hero.Mono>coletadas.</Hero.Mono>
					</>
				}
				lead="Posts do LinkedIn lidos pela IA, filtrados e prontos pra você agir: abrir o post, copiar o contato, gerar o currículo."
				aside={
					<dl className="m-0 flex gap-10 max-md:gap-7">
						<div className="flex flex-col-reverse">
							<dt className="text-muted text-sm">no histórico</dt>
							<dd className="m-0 font-mono text-3xl">{facets ? facets.total.toLocaleString('pt-BR') : '–'}</dd>
						</div>
						<div className="flex flex-col-reverse">
							<dt className="text-muted text-sm">currículos gerando</dt>
							<dd className="m-0 font-mono text-3xl">{pendingCvs}</dd>
						</div>
					</dl>
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

			<div className="flex flex-wrap items-start gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3.5">
				<Button
					variant="ghost"
					className="hidden self-start max-md:inline-flex"
					aria-expanded={filtersOpen}
					aria-controls="filters"
					onClick={() => setFiltersOpen(!filtersOpen)}
				>
					<Icon name="filter" />
					filtros{hasActiveFilters(filters) ? ' · ativos' : ''}
				</Button>
				<Filters open={filtersOpen} />

				<section
					className="flex min-w-0 grow-999 basis-110 flex-col gap-2.5 max-md:basis-auto"
					aria-label="Lista de vagas"
					aria-busy={status === 'loading'}
				>
					{status === 'ready' && jobs.length > 0 && (
						<div className="flex items-center justify-between gap-3 font-mono text-muted text-xs">
							<span>
								{jobs.length}
								{nextCursor ? '+' : ''} vagas
							</span>
							<span>mais recentes primeiro</span>
						</div>
					)}
					<JobList selectedId={wide ? (selected?.postId ?? null) : null} onSelect={select} />
				</section>

				{wide && selected && (
					<aside className={DETAIL_PANEL} aria-label="Detalhe da vaga">
						<JobDetail job={selected} />
					</aside>
				)}
				{wide && !selected && selectedRouteId && (
					<aside className={DETAIL_PANEL} aria-label="Detalhe da vaga" aria-busy={!routeJob.error}>
						{routeJob.error ? (
							<EmptyState
								bare
								tone="error"
								title={routeJob.error}
								action={
									<Button variant="lime" href="/" onClick={onLinkClick}>
										ver todas as vagas
									</Button>
								}
							/>
						) : (
							<Skeleton className="min-h-60" />
						)}
					</aside>
				)}
			</div>
		</Page>
	)
}
