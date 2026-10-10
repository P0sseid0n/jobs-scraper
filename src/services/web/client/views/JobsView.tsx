import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { WebJob } from '../../api-types'
import { Icon } from '../components/Icon'
import { JobCard, JobCardSkeleton } from '../components/JobCard'
import { JobDetail } from '../components/JobDetail'
import { LANGUAGE_NAMES, WORK_MODES } from '../lib/format'
import { wideLayout } from '../lib/media'
import { navigate, onLinkClick } from '../router'
import { trayRequests } from '../stores/cv'
import {
	clearFilters,
	error,
	facets,
	filters,
	filtersActive,
	incoming,
	jobs,
	loadingMore,
	loadJobs,
	loadMoreJobs,
	nextCursor,
	showIncoming,
	startJobs,
	status,
} from '../stores/jobs'
import { markSeen } from '../stores/seen'

const PERIODS = [
	['24h', '24h'],
	['7d', '7 dias'],
	['30d', '30 dias'],
	['all', 'tudo'],
] as const

const VISIBLE_SKILL_FILTERS = 12

/** Tela principal: filtros, lista para escanear e, no desktop, o detalhe da vaga ao lado. */
export const JobsView = defineComponent({
	name: 'JobsView',
	setup() {
		startJobs()

		const selectedId = ref<string | null>(null)
		const filtersOpen = ref(false)
		const allSkills = ref(false)
		const sentinel = ref<HTMLElement | null>(null)

		const selected = computed(
			() => jobs.value.find(job => job.postId === selectedId.value) ?? (wideLayout.value ? jobs.value[0] : null),
		)

		function select(job: WebJob) {
			markSeen(job.postId)

			if (!wideLayout.value) {
				navigate(`/vagas/${encodeURIComponent(job.postId)}`)
				return
			}
			selectedId.value = job.postId
		}

		// Rolagem infinita: carrega a próxima página quando o fim da lista aparece
		let observer: IntersectionObserver | undefined
		onMounted(() => {
			observer = new IntersectionObserver(entries => entries.some(entry => entry.isIntersecting) && loadMoreJobs(), {
				rootMargin: '400px',
			})
			watch(
				sentinel,
				(el, old) => {
					if (old) observer?.unobserve(old)
					if (el) observer?.observe(el)
				},
				{ immediate: true },
			)
		})
		onBeforeUnmount(() => observer?.disconnect())

		const toggle = (list: string[], value: string) => {
			const index = list.indexOf(value)
			if (index >= 0) list.splice(index, 1)
			else list.push(value)
		}

		const pendingCvs = computed(() => trayRequests.value.filter(request => request.status === 'pending').length)

		function renderFilters() {
			const counts = facets.value
			const skills = counts?.skills ?? []
			const selectedSkills = filters.skills.filter(skill => !skills.some(item => item.name.toLowerCase() === skill.toLowerCase()))
			const visibleSkills = allSkills.value ? skills : skills.slice(0, VISIBLE_SKILL_FILTERS)

			return (
				<aside class={['filters', filtersOpen.value && 'open']} aria-label="Filtros" id="filters">
					<label class="search-field">
						<Icon name="search" />
						<span class="sr-only">Buscar vagas</span>
						<input
							type="search"
							value={filters.q}
							onInput={(event: Event) => (filters.q = (event.target as HTMLInputElement).value)}
							placeholder="cargo, empresa, tecnologia…"
						/>
					</label>

					<fieldset class="filter-group">
						<legend class="label">período_</legend>
						<div class="pills">
							{PERIODS.map(([value, label]) => (
								<button
									type="button"
									key={value}
									class="pill"
									aria-pressed={filters.since === value}
									onClick={() => (filters.since = value)}
								>
									{label}
								</button>
							))}
						</div>
					</fieldset>

					<fieldset class="filter-group">
						<legend class="label">modalidade_</legend>
						<div class="stack-xs">
							{(Object.keys(WORK_MODES) as (keyof typeof WORK_MODES)[]).map(mode => (
								<button
									type="button"
									key={mode}
									class="pill pill-row"
									aria-pressed={filters.workMode.includes(mode)}
									onClick={() => toggle(filters.workMode, mode)}
								>
									<span class="dot" style={{ background: WORK_MODES[mode].color }} />
									<span class="grow">{WORK_MODES[mode].label}</span>
									{counts && <span class="mono xsmall count">{counts.workModes[mode]}</span>}
								</button>
							))}
						</div>
					</fieldset>

					{(skills.length > 0 || filters.skills.length > 0) && (
						<fieldset class="filter-group">
							<legend class="label">tecnologias_</legend>
							<div class="pills">
								{selectedSkills.map(skill => (
									<button
										type="button"
										key={skill}
										class="pill"
										aria-pressed="true"
										onClick={() => toggle(filters.skills, skill)}
									>
										{skill}
									</button>
								))}
								{visibleSkills.map(skill => (
									<button
										type="button"
										key={skill.name}
										class="pill"
										aria-pressed={filters.skills.some(item => item.toLowerCase() === skill.name.toLowerCase())}
										onClick={() => {
											const current = filters.skills.find(item => item.toLowerCase() === skill.name.toLowerCase())
											toggle(filters.skills, current ?? skill.name)
										}}
									>
										{skill.name} <span class="mono count">{skill.count}</span>
									</button>
								))}
								{skills.length > VISIBLE_SKILL_FILTERS && (
									<button type="button" class="pill pill-dashed" onClick={() => (allSkills.value = !allSkills.value)}>
										{allSkills.value ? 'menos' : `+ ${skills.length - VISIBLE_SKILL_FILTERS}`}
									</button>
								)}
							</div>
						</fieldset>
					)}

					<div class="filter-group filter-extra">
						<label class="row-between">
							tem e-mail de contato
							<input
								type="checkbox"
								class="checkbox"
								checked={filters.hasEmail}
								onChange={(event: Event) => (filters.hasEmail = (event.target as HTMLInputElement).checked)}
							/>
						</label>
						<label class="row-between">
							idioma
							<select
								class="select"
								value={filters.language}
								onChange={(event: Event) => (filters.language = (event.target as HTMLSelectElement).value)}
							>
								<option value="">todos</option>
								{Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
									<option value={code} key={code}>
										{name} ({code})
									</option>
								))}
							</select>
						</label>
						<label class="stack-xs">
							<span class="row-between">
								confiança mínima <span class="mono">{filters.minConfidence}%</span>
							</span>
							<input
								type="range"
								class="range"
								min={0}
								max={100}
								step={5}
								value={filters.minConfidence}
								onInput={(event: Event) => (filters.minConfidence = Number((event.target as HTMLInputElement).value))}
							/>
						</label>
					</div>

					{filtersActive.value && (
						<button type="button" class="btn btn-ghost" onClick={clearFilters}>
							limpar filtros
						</button>
					)}
				</aside>
			)
		}

		function renderList() {
			if (status.value === 'loading') {
				return [1, 2, 3, 4, 5].map(key => <JobCardSkeleton key={key} />)
			}

			if (status.value === 'error') {
				return (
					<div class="card empty" role="alert">
						<Icon name="alert" size={22} />
						<p class="strong">Não consegui carregar as vagas</p>
						<p class="muted small">{error.value}</p>
						<button type="button" class="btn btn-lime" onClick={loadJobs}>
							tentar de novo
						</button>
					</div>
				)
			}

			if (jobs.value.length === 0) {
				return filtersActive.value ? (
					<div class="card empty">
						<p class="strong">Nenhuma vaga com esses filtros</p>
						<p class="muted small">Tente outra busca ou volte a mostrar todas as vagas.</p>
						<button type="button" class="btn btn-lime" onClick={clearFilters}>
							limpar filtros
						</button>
					</div>
				) : (
					<div class="card empty">
						<p class="strong">Nenhuma vaga ainda</p>
						<p class="muted small">Rode uma coleta: as vagas aparecem aqui assim que a IA terminar de ler os posts.</p>
						<a class="btn btn-lime" href="/coletas" onClick={onLinkClick}>
							ir para coletas
						</a>
					</div>
				)
			}

			return [
				...jobs.value.map(job => (
					<JobCard
						key={job.postId}
						job={job}
						selected={wideLayout.value && selected.value?.postId === job.postId}
						onSelect={select}
					/>
				)),
				nextCursor.value ? (
					<div ref={sentinel} class="load-more" key="more">
						<button type="button" class="btn btn-ghost" disabled={loadingMore.value} onClick={loadMoreJobs}>
							{loadingMore.value ? 'carregando…' : 'carregar mais vagas'}
						</button>
					</div>
				) : (
					<p class="mono muted xsmall end-of-list" key="end">
						fim da lista
					</p>
				),
			]
		}

		return () => (
			<div class="page">
				<section class="hero">
					<div>
						<h1 class="display">
							vagas de front-end,
							<br />
							<span class="mono display-mono">coletadas.</span>
						</h1>
						<p class="muted lead">
							Posts do LinkedIn lidos pela IA, filtrados e prontos pra você agir: abrir o post, copiar o contato, gerar o
							currículo.
						</p>
					</div>
					<dl class="stats">
						<div>
							<dt class="muted small">no histórico</dt>
							<dd class="mono">{facets.value ? facets.value.total.toLocaleString('pt-BR') : '–'}</dd>
						</div>
						<div>
							<dt class="muted small">currículos gerando</dt>
							<dd class="mono">{pendingCvs.value}</dd>
						</div>
					</dl>
				</section>

				{incoming.value.length > 0 && (
					<button type="button" class="new-jobs" onClick={showIncoming}>
						<span class="mono live-tag">ao vivo</span>
						{incoming.value.length === 1 ? '1 vaga nova' : `${incoming.value.length} vagas novas`}
						<span class="mono xsmall underline">mostrar no topo</span>
					</button>
				)}

				<div class="jobs-layout">
					<button
						type="button"
						class="btn btn-ghost filters-toggle"
						aria-expanded={filtersOpen.value}
						aria-controls="filters"
						onClick={() => (filtersOpen.value = !filtersOpen.value)}
					>
						<Icon name="filter" />
						filtros{filtersActive.value ? ' · ativos' : ''}
					</button>
					{renderFilters()}

					<section class="job-list" aria-label="Lista de vagas" aria-busy={status.value === 'loading'}>
						{status.value === 'ready' && jobs.value.length > 0 && (
							<div class="row-between mono muted xsmall">
								<span>
									{jobs.value.length}
									{nextCursor.value ? '+' : ''} vagas
								</span>
								<span>mais recentes primeiro</span>
							</div>
						)}
						{renderList()}
					</section>

					{wideLayout.value && selected.value && (
						<aside class="card detail-panel" aria-label="Detalhe da vaga">
							<JobDetail job={selected.value} />
						</aside>
					)}
				</div>
			</div>
		)
	},
})
