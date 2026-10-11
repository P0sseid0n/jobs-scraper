import { defineComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import type { ScraperStatus, WebScraperRun } from '../../api-types'
import { api, type RequestError } from '../api'
import { Switch } from '../components/forms'
import { Icon } from '../components/Icon'
import { formatDateTime, formatDuration, formatInterval, isLoginFailure } from '../lib/format'
import { onLinkClick } from '../router'
import { notify } from '../stores/toast'

const TRIGGERS: Record<WebScraperRun['trigger'], string> = { schedule: 'Agendada', manual: 'Manual', once: 'Execução única' }

const POLL_RUNNING_MS = 5_000
const POLL_IDLE_MS = 30_000

/** Acompanhamento do scraper: coleta em andamento, próxima agendada, "coletar agora" e histórico. */
export const RunsView = defineComponent({
	name: 'RunsView',
	setup() {
		const status = ref<ScraperStatus | null>(null)
		const statusError = ref<string | null>(null)
		const runs = ref<WebScraperRun[]>([])
		const runsCursor = ref<string | null>(null)
		const runsState = ref<'loading' | 'ready' | 'error'>('loading')
		const expanded = reactive(new Set<string>())
		const requesting = ref(false)
		const savingPause = ref(false)
		const now = ref(Date.now())

		let pollTimer: ReturnType<typeof setTimeout> | undefined
		const clock = setInterval(() => (now.value = Date.now()), 1000)

		async function refreshStatus() {
			clearTimeout(pollTimer)
			const wasRunning = !!status.value?.current

			try {
				status.value = await api.scraperStatus()
				statusError.value = null
				// A coleta terminou (ou começou) desde a última consulta: atualiza o histórico
				if (wasRunning !== !!status.value.current) void loadRuns()
			} catch (error) {
				statusError.value = (error as Error).message
			}

			pollTimer = setTimeout(refreshStatus, status.value?.current ? POLL_RUNNING_MS : POLL_IDLE_MS)
		}

		async function loadRuns(more = false) {
			if (!more) runsState.value = 'loading'

			try {
				const page = await api.runs(more ? runsCursor.value : null)
				runs.value = more ? [...runs.value, ...page.runs] : page.runs
				runsCursor.value = page.nextCursor
				runsState.value = 'ready'
			} catch {
				runsState.value = 'error'
			}
		}

		async function runNow() {
			requesting.value = true
			try {
				await api.runNow()
				notify('Coleta solicitada. Ela começa em instantes (se o scraper estiver rodando).')
				setTimeout(refreshStatus, 2_000)
			} catch (error) {
				notify((error as RequestError).message, 'error')
			} finally {
				requesting.value = false
			}
		}

		async function setPaused(paused: boolean) {
			savingPause.value = true
			try {
				const settings = await api.saveSettings('scraper', { paused })
				if (status.value) status.value.paused = settings.paused
				notify(paused ? 'Coletas automáticas pausadas' : 'Coletas automáticas retomadas')
				void refreshStatus()
			} catch (error) {
				notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
			} finally {
				savingPause.value = false
			}
		}

		onMounted(() => {
			void refreshStatus()
			void loadRuns()
		})
		onBeforeUnmount(() => {
			clearTimeout(pollTimer)
			clearInterval(clock)
		})

		function toggle(id: string) {
			if (expanded.has(id)) expanded.delete(id)
			else expanded.add(id)
		}

		function renderAlert() {
			const last = status.value?.last
			if (last?.status !== 'failed' || status.value?.current) return null

			const login = isLoginFailure(last.error)

			return (
				<div class="alert" role="alert">
					<Icon name="alert" size={20} />
					<div class="grow">
						<p class="strong">{login ? 'Ação necessária: o LinkedIn pediu verificação' : 'A última coleta falhou'}</p>
						<p class="small">
							{formatDateTime(last.startedAt)} · {last.error ?? 'sem detalhes'}
							{login &&
								' Resolva o captcha/2FA na sessão do scraper (rode com HEADLESS=false ou renove o LINKEDIN_LI_AT); as próximas coletas vão falhar até lá.'}
						</p>
					</div>
				</div>
			)
		}

		function renderCurrent() {
			const s = status.value
			if (!s) {
				return statusError.value ? (
					<div class="card empty" role="alert">
						<p class="strong">Não consegui ler o status do scraper</p>
						<p class="muted small">{statusError.value}</p>
					</div>
				) : (
					<div class="card skeleton status-skeleton" aria-busy="true" />
				)
			}

			const running = s.current
			const next = s.nextRunAt ? new Date(s.nextRunAt).getTime() - now.value : null

			return (
				<div class="status-grid">
					<section class={['status-card', running ? 'status-running' : 'status-idle']} aria-live="polite">
						<div class="row-between wrap">
							<div class="row gap-sm">
								<span class={['tag', running ? 'tag-lime' : s.paused ? 'tag-muted' : 'tag-ok']}>
									{running ? 'em andamento' : s.paused ? 'pausada' : 'ociosa'}
								</span>
								{running && (
									<span class="mono xsmall on-dark-muted">
										{TRIGGERS[running.trigger].toLowerCase()} · iniciada {formatDateTime(running.startedAt)}
									</span>
								)}
							</div>
							{running && (
								<span class="mono status-clock">{formatDuration(now.value - new Date(running.startedAt).getTime())}</span>
							)}
						</div>

						{running ? (
							<p class="on-dark-muted small">
								Buscando os posts de cada termo ativo e enviando para a IA. Uma coleta leva de 2 a 10 minutos; o resultado por
								termo aparece no histórico quando ela terminar.
							</p>
						) : (
							<div>
								<p class="on-dark-muted small">próxima coleta automática</p>
								<p class="mono status-next">
									{s.paused
										? 'coletas pausadas'
										: next !== null && next > 0
											? `em ${formatDuration(next)}`
											: 'a qualquer momento'}
								</p>
							</div>
						)}

						<div class="row-between wrap">
							<span class="mono xsmall on-dark-muted">
								{s.paused ? '“coletar agora” continua funcionando' : formatInterval(s.intervalMinutes)}
							</span>
							<button type="button" class="btn btn-lime btn-lg" disabled={!!running || requesting.value} onClick={runNow}>
								<Icon name={running ? 'spinner' : 'refresh'} />
								{running ? 'coletando…' : requesting.value ? 'pedindo…' : 'coletar agora'}
							</button>
						</div>
					</section>

					<section class="card stack-sm">
						<h2 class="label">agenda_</h2>
						<div class="row-between">
							<label for="runs-paused">
								<span class="strong">pausar coletas automáticas</span>
								<span class="muted xsmall block">o intervalo para de contar até você retomar</span>
							</label>
							<Switch
								id="runs-paused"
								checked={s.paused}
								label="Pausar coletas automáticas"
								disabled={savingPause.value}
								onChange={setPaused}
							/>
						</div>
						{s.last && (
							<p class="muted small">
								última coleta: {formatDateTime(s.last.startedAt)} ·{' '}
								{s.last.status === 'success' ? `${s.last.sent} posts enviados` : 'falhou'}
							</p>
						)}
						<a class="link small" href="/configuracoes" onClick={onLinkClick}>
							editar termos e intervalo
						</a>
					</section>
				</div>
			)
		}

		function renderRun(run: WebScraperRun) {
			const failedTerms = run.terms.filter(term => term.error).length
			const duration = run.finishedAt ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) : '–'
			const open = expanded.has(run.id)

			return [
				<tr key={run.id}>
					<td>
						<span class={['tag', `run-${run.status}`]}>
							<span class="dot" />
							{run.status === 'running' ? 'em andamento' : run.status === 'success' ? 'sucesso' : 'falha'}
						</span>
					</td>
					<td>{TRIGGERS[run.trigger]}</td>
					<td class="mono">{formatDateTime(run.startedAt)}</td>
					<td class="mono">{duration}</td>
					<td class="mono">{run.sent}</td>
					<td class={['wrap-cell', (run.error || failedTerms > 0) && 'danger-text']}>
						{run.error && run.status === 'failed'
							? run.error
							: run.terms.length > 0
								? `${run.terms.length - failedTerms} de ${run.terms.length}${failedTerms ? ` · ${failedTerms} com falha` : ''}`
								: '–'}
					</td>
					<td>
						{run.terms.length > 0 && (
							<button type="button" class="btn btn-ghost btn-xs" aria-expanded={open} onClick={() => toggle(run.id)}>
								{open ? 'recolher' : 'detalhar'}
							</button>
						)}
					</td>
				</tr>,
				open && (
					<tr key={`${run.id}-terms`} class="terms-row">
						<td colspan={7}>
							<ul class="terms-grid plain">
								{run.terms.map(term => (
									<li key={term.term} class={['card term-card', term.error && 'term-failed']}>
										<span class="mono muted xsmall">{term.term}</span>
										{term.error ? (
											<span class="small danger-text">falhou: {term.error}</span>
										) : (
											<span class="mono term-sent">{term.sent} enviados</span>
										)}
									</li>
								))}
							</ul>
						</td>
					</tr>
				),
			]
		}

		return () => (
			<div class="page">
				<section class="hero">
					<div>
						<h1 class="display">
							coletas <span class="mono display-mono">do scraper.</span>
						</h1>
						<p class="muted lead">Histórico dos últimos 90 dias. Cada coleta busca posts por termo e manda para a IA.</p>
					</div>
				</section>

				{renderAlert()}
				{renderCurrent()}

				<section class="stack-sm">
					<div class="row-between wrap">
						<h2 class="section-title">
							histórico <span class="mono">de coletas</span>
						</h2>
						<span class="mono muted xsmall">enviados = posts para a IA, não vagas salvas</span>
					</div>

					{runsState.value === 'error' && (
						<div class="notice notice-danger" role="alert">
							Não consegui carregar o histórico.{' '}
							<button type="button" class="link-btn" onClick={() => loadRuns()}>
								tentar de novo
							</button>
						</div>
					)}
					{runsState.value === 'loading' && <div class="card skeleton table-skeleton" aria-busy="true" />}
					{runsState.value === 'ready' && runs.value.length === 0 && (
						<div class="card empty">
							<p class="strong">Nenhuma coleta nos últimos 90 dias</p>
							<p class="muted small">Use “coletar agora” ou rode o scraper com SCRAPER_INTERVAL_MINUTES maior que 0.</p>
						</div>
					)}
					{runsState.value === 'ready' && runs.value.length > 0 && (
						<div class="card table-wrap">
							<table class="runs-table">
								<thead>
									<tr>
										<th scope="col">status</th>
										<th scope="col">gatilho</th>
										<th scope="col">início</th>
										<th scope="col">duração</th>
										<th scope="col">enviados</th>
										<th scope="col">termos</th>
										<th scope="col">
											<span class="sr-only">detalhes</span>
										</th>
									</tr>
								</thead>
								<tbody>{runs.value.flatMap(renderRun)}</tbody>
							</table>
						</div>
					)}
					{runsCursor.value && (
						<button type="button" class="btn btn-ghost center" onClick={() => loadRuns(true)}>
							carregar coletas anteriores
						</button>
					)}
				</section>
			</div>
		)
	},
})
