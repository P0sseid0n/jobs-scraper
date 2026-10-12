import { useEffect, useState } from 'react'

import type { WebJob } from '../../api-types'
import { Icon } from '../components/Icon'
import { JobCard, JobCardSkeleton } from '../components/JobCard'
import { JobDetail } from '../components/JobDetail'
import { cx } from '../lib/cx'
import { LANGUAGE_NAMES, WORK_MODES } from '../lib/format'
import { hasActiveFilters } from '../lib/job-filters'
import { useWideLayout } from '../lib/media'
import { jobPath, navigate, onLinkClick } from '../router'
import { useTrayRequests } from '../stores/cv'
import { clearFilters, loadJobs, loadMoreJobs, setFilters, showIncoming, startJobs, useJobs } from '../stores/jobs'
import { markSeen } from '../stores/seen'

const PERIODS = [
	['24h', '24h'],
	['7d', '7 dias'],
	['30d', '30 dias'],
	['all', 'tudo'],
] as const

const VISIBLE_SKILL_FILTERS = 12

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
		<aside className={cx('filters', open && 'open')} aria-label="Filtros" id="filters">
			<label className="search-field">
				<Icon name="search" />
				<span className="sr-only">Buscar vagas</span>
				<input
					type="search"
					value={filters.q}
					onChange={event => setFilters({ q: event.target.value })}
					placeholder="cargo, empresa, tecnologia…"
				/>
			</label>

			<fieldset className="filter-group">
				<legend className="label">período_</legend>
				<div className="pills">
					{PERIODS.map(([value, label]) => (
						<button
							type="button"
							key={value}
							className="pill"
							aria-pressed={filters.since === value}
							onClick={() => setFilters({ since: value })}
						>
							{label}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="filter-group">
				<legend className="label">modalidade_</legend>
				<div className="stack-xs">
					{(Object.keys(WORK_MODES) as (keyof typeof WORK_MODES)[]).map(mode => (
						<button
							type="button"
							key={mode}
							className="pill pill-row"
							aria-pressed={filters.workMode.includes(mode)}
							onClick={() => setFilters({ workMode: toggled(filters.workMode, mode) })}
						>
							<span className="dot" style={{ background: WORK_MODES[mode].color }} />
							<span className="grow">{WORK_MODES[mode].label}</span>
							{facets && <span className="mono xsmall count">{facets.workModes[mode]}</span>}
						</button>
					))}
				</div>
			</fieldset>

			{(skills.length > 0 || filters.skills.length > 0) && (
				<fieldset className="filter-group">
					<legend className="label">tecnologias_</legend>
					<div className="pills">
						{selectedSkills.map(skill => (
							<button
								type="button"
								key={skill}
								className="pill"
								aria-pressed="true"
								onClick={() => setFilters({ skills: toggled(filters.skills, skill) })}
							>
								{skill}
							</button>
						))}
						{visibleSkills.map(skill => {
							const current = filters.skills.find(item => item.toLowerCase() === skill.name.toLowerCase())

							return (
								<button
									type="button"
									key={skill.name}
									className="pill"
									aria-pressed={current !== undefined}
									onClick={() => setFilters({ skills: toggled(filters.skills, current ?? skill.name) })}
								>
									{skill.name} <span className="mono count">{skill.count}</span>
								</button>
							)
						})}
						{skills.length > VISIBLE_SKILL_FILTERS && (
							<button type="button" className="pill pill-dashed" onClick={() => setAllSkills(!allSkills)}>
								{allSkills ? 'menos' : `+ ${skills.length - VISIBLE_SKILL_FILTERS}`}
							</button>
						)}
					</div>
				</fieldset>
			)}

			<div className="filter-group filter-extra">
				<label className="row-between">
					tem e-mail de contato
					<input
						type="checkbox"
						className="checkbox"
						checked={filters.hasEmail}
						onChange={event => setFilters({ hasEmail: event.target.checked })}
					/>
				</label>
				<label className="row-between">
					idioma
					<select className="select" value={filters.language} onChange={event => setFilters({ language: event.target.value })}>
						<option value="">todos</option>
						{Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
							<option value={code} key={code}>
								{name} ({code})
							</option>
						))}
					</select>
				</label>
				<label className="stack-xs">
					<span className="row-between">
						confiança mínima <span className="mono">{filters.minConfidence}%</span>
					</span>
					<input
						type="range"
						className="range"
						min={0}
						max={100}
						step={5}
						value={filters.minConfidence}
						onChange={event => setFilters({ minConfidence: Number(event.target.value) })}
					/>
				</label>
			</div>

			{hasActiveFilters(filters) && (
				<button type="button" className="btn btn-ghost" onClick={clearFilters}>
					limpar filtros
				</button>
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
			<div className="card empty" role="alert">
				<Icon name="alert" size={22} />
				<p className="strong">Não consegui carregar as vagas</p>
				<p className="muted small">{error}</p>
				<button type="button" className="btn btn-lime" onClick={loadJobs}>
					tentar de novo
				</button>
			</div>
		)
	}

	if (jobs.length === 0) {
		return hasActiveFilters(filters) ? (
			<div className="card empty">
				<p className="strong">Nenhuma vaga com esses filtros</p>
				<p className="muted small">Tente outra busca ou volte a mostrar todas as vagas.</p>
				<button type="button" className="btn btn-lime" onClick={clearFilters}>
					limpar filtros
				</button>
			</div>
		) : (
			<div className="card empty">
				<p className="strong">Nenhuma vaga ainda</p>
				<p className="muted small">Rode uma coleta: as vagas aparecem aqui assim que a IA terminar de ler os posts.</p>
				<a className="btn btn-lime" href="/coletas" onClick={onLinkClick}>
					ir para coletas
				</a>
			</div>
		)
	}

	return (
		<>
			{jobs.map(job => (
				<JobCard key={job.postId} job={job} selected={selectedId === job.postId} onSelect={onSelect} />
			))}
			{nextCursor ? (
				<div ref={observeEnd} className="load-more">
					<button type="button" className="btn btn-ghost" disabled={loadingMore} onClick={loadMoreJobs}>
						{loadingMore ? 'carregando…' : 'carregar mais vagas'}
					</button>
				</div>
			) : (
				<p className="mono muted xsmall end-of-list">fim da lista</p>
			)}
		</>
	)
}

/** Tela principal: filtros, lista para escanear e, no desktop, o detalhe da vaga ao lado. */
export function JobsView() {
	const { jobs, status, facets, filters, nextCursor, incoming } = useJobs()
	const wide = useWideLayout()
	const tray = useTrayRequests()
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [filtersOpen, setFiltersOpen] = useState(false)

	useEffect(startJobs, [])

	const selected = jobs.find(job => job.postId === selectedId) ?? (wide ? jobs[0] : undefined)
	const pendingCvs = tray.filter(request => request.status === 'pending').length

	function select(job: WebJob) {
		markSeen(job.postId)

		if (!wide) {
			navigate(jobPath(job.postId))
			return
		}
		setSelectedId(job.postId)
	}

	return (
		<div className="page">
			<section className="hero">
				<div>
					<h1 className="display">
						vagas de front-end,
						<br />
						<span className="mono display-mono">coletadas.</span>
					</h1>
					<p className="muted lead">
						Posts do LinkedIn lidos pela IA, filtrados e prontos pra você agir: abrir o post, copiar o contato, gerar o
						currículo.
					</p>
				</div>
				<dl className="stats">
					<div>
						<dt className="muted small">no histórico</dt>
						<dd className="mono">{facets ? facets.total.toLocaleString('pt-BR') : '–'}</dd>
					</div>
					<div>
						<dt className="muted small">currículos gerando</dt>
						<dd className="mono">{pendingCvs}</dd>
					</div>
				</dl>
			</section>

			{incoming.length > 0 && (
				<button type="button" className="new-jobs" onClick={showIncoming}>
					<span className="mono live-tag">ao vivo</span>
					{incoming.length === 1 ? '1 vaga nova' : `${incoming.length} vagas novas`}
					<span className="mono xsmall underline">mostrar no topo</span>
				</button>
			)}

			<div className="jobs-layout">
				<button
					type="button"
					className="btn btn-ghost filters-toggle"
					aria-expanded={filtersOpen}
					aria-controls="filters"
					onClick={() => setFiltersOpen(!filtersOpen)}
				>
					<Icon name="filter" />
					filtros{hasActiveFilters(filters) ? ' · ativos' : ''}
				</button>
				<Filters open={filtersOpen} />

				<section className="job-list" aria-label="Lista de vagas" aria-busy={status === 'loading'}>
					{status === 'ready' && jobs.length > 0 && (
						<div className="row-between mono muted xsmall">
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
					<aside className="card detail-panel" aria-label="Detalhe da vaga">
						<JobDetail job={selected} />
					</aside>
				)}
			</div>
		</div>
	)
}
