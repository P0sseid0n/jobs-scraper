import { useEffect, useRef, useState } from 'react'

import type { ScraperStatus, WebScraperRun } from '../../api-types'
import { api, type RequestError } from '../api'
import { Icon } from '../components/Icon'
import { Badge, badge, BadgeList, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusDot, type StatusDotTone } from '../components/ui/StatusDot'
import { SwitchField } from '../components/ui/Switch'
import { TextLink } from '../components/ui/TextLink'
import { cx } from '../lib/cx'
import { formatDateTime, formatDuration, formatInterval, isLoginFailure } from '../lib/format'
import { onLinkClick } from '../router'
import { notify } from '../stores/toast'

const TRIGGERS: Record<WebScraperRun['trigger'], string> = { schedule: 'Agendada', manual: 'Manual', once: 'Execução única' }

/** O que o post-processing fez com cada post, na ordem em que os filtros rodam. */
const OUTCOMES: Record<keyof NonNullable<WebScraperRun['outcomes']>['counts'], string> = {
	saved: 'viraram vaga',
	'multi-job': 'listas de vagas (abertas uma a uma)',
	language: 'idioma fora dos aceitos',
	'job-seeker': 'candidato procurando vaga',
	'not-a-job': 'não são vaga, segundo a IA',
	'low-confidence': 'confiança da IA baixa',
	keywords: 'fora das palavras-chave',
	'missing-fields': 'sem cargo ou link do post',
	unknown: 'processados por uma versão anterior',
}

// Não são descarte: as listas têm as vagas abertas à parte, e os posts sem destino registrado podem ter virado vaga
const NOT_DISCARDED = new Set(['saved', 'multi-job', 'unknown'])

/** Posts da coleta descartados pelo post-processing. */
function discarded(run: WebScraperRun) {
	const counts = run.outcomes?.counts ?? {}
	return Object.entries(counts).reduce((total, [outcome, count]) => (NOT_DISCARDED.has(outcome) ? total : total + (count ?? 0)), 0)
}

const RUN_STATUS: Record<WebScraperRun['status'], { label: string; tone: BadgeTone; dot: StatusDotTone }> = {
	running: { label: 'em andamento', tone: 'running', dot: 'current' },
	success: { label: 'sucesso', tone: 'ok', dot: 'ok' },
	failed: { label: 'falha', tone: 'danger', dot: 'current' },
}

const POLL_RUNNING_MS = 5_000
const POLL_IDLE_MS = 30_000

function FailureAlert({ status }: { status: ScraperStatus | null }) {
	const last = status?.last
	if (last?.status !== 'failed' || status?.current) return null

	const login = isLoginFailure(last.error)

	return (
		<Notice tone="danger" size="lg" icon="alert">
			<p className="strong">{login ? 'Ação necessária: o LinkedIn pediu verificação' : 'A última coleta falhou'}</p>
			<p className="small">
				{formatDateTime(last.startedAt)} · {last.error ?? 'sem detalhes'}
				{login &&
					' Resolva o captcha/2FA na sessão do scraper (rode com HEADLESS=false ou renove o LINKEDIN_LI_AT); as próximas coletas vão falhar até lá.'}
			</p>
		</Notice>
	)
}

/** "3 posts novos · 1 vaga nova", ou o aviso de que a busca só trouxe posts já processados. */
function lastRunSummary(run: WebScraperRun) {
	if (run.sent === 0) return run.skipped > 0 ? `nenhum post novo (${run.skipped} já vistos)` : 'nenhum post encontrado'

	const posts = `${run.sent} ${run.sent === 1 ? 'post novo' : 'posts novos'}`
	if (run.newJobs === null) return posts
	return `${posts} · ${run.newJobs} ${run.newJobs === 1 ? 'vaga nova' : 'vagas novas'}`
}

function RunRows({ run, open, onToggle }: { run: WebScraperRun; open: boolean; onToggle: () => void }) {
	const failedTerms = run.terms.filter(term => term.error).length
	const duration = run.finishedAt ? formatDuration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) : '–'

	return (
		<>
			<tr>
				<td>
					<Badge tone={RUN_STATUS[run.status].tone}>
						<StatusDot tone={RUN_STATUS[run.status].dot} />
						{RUN_STATUS[run.status].label}
					</Badge>
				</td>
				<td>{TRIGGERS[run.trigger]}</td>
				<td className="mono">{formatDateTime(run.startedAt)}</td>
				<td className="mono">{duration}</td>
				<td className="mono">
					{run.sent}
					{run.skipped > 0 && <span className="muted xsmall"> · {run.skipped} já vistos</span>}
				</td>
				<td className="mono">
					{run.newJobs ?? '–'}
					{discarded(run) > 0 && <span className="muted xsmall"> · {discarded(run)} descartados</span>}
					{(run.outcomes?.pending ?? 0) > 0 && <span className="muted xsmall"> · {run.outcomes?.pending} na fila</span>}
				</td>
				<td className={cx('wrap-cell', (run.error || failedTerms > 0) && 'danger-text')}>
					{run.error && run.status === 'failed'
						? run.error
						: run.terms.length > 0
							? `${run.terms.length - failedTerms} de ${run.terms.length}${failedTerms ? ` · ${failedTerms} com falha` : ''}`
							: '–'}
				</td>
				<td>
					{run.terms.length > 0 && (
						<Button variant="ghost" size="xs" aria-expanded={open} onClick={onToggle}>
							{open ? 'recolher' : 'detalhar'}
						</Button>
					)}
				</td>
			</tr>
			{open && (
				<tr className="terms-row">
					<td colSpan={8}>
						<ul className="terms-grid plain">
							{run.terms.map(term => (
								<li key={term.term} className={cx('card term-card', term.error && 'term-failed')}>
									<span className="mono muted xsmall">{term.term}</span>
									{term.error ? (
										<span className="small danger-text">falhou: {term.error}</span>
									) : (
										<span className="mono term-sent">
											{term.sent} novos{term.skipped > 0 && <span className="muted"> · {term.skipped} já vistos</span>}
										</span>
									)}
								</li>
							))}
						</ul>
						{run.outcomes && run.sent > 0 && (
							<div className="stack-xs run-outcomes">
								<span className="label">destino dos posts novos_</span>
								<BadgeList>
									{(Object.keys(OUTCOMES) as (keyof typeof OUTCOMES)[])
										.filter(outcome => run.outcomes?.counts[outcome])
										.map(outcome => (
											<li key={outcome} className={badge({ tone: outcome === 'saved' ? 'running' : 'neutral' })}>
												{run.outcomes?.counts[outcome]} {OUTCOMES[outcome]}
											</li>
										))}
									{run.outcomes.pending > 0 && <li className={badge()}>{run.outcomes.pending} ainda na fila da IA</li>}
								</BadgeList>
							</div>
						)}
					</td>
				</tr>
			)}
		</>
	)
}

/** Acompanhamento do scraper: coleta em andamento, próxima agendada, "coletar agora" e histórico. */
export function RunsView() {
	const [status, setStatus] = useState<ScraperStatus | null>(null)
	const [statusError, setStatusError] = useState<string | null>(null)
	const [runs, setRuns] = useState<WebScraperRun[]>([])
	const [runsCursor, setRunsCursor] = useState<string | null>(null)
	const [runsState, setRunsState] = useState<'loading' | 'ready' | 'error'>('loading')
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
	const [requesting, setRequesting] = useState(false)
	const [savingPause, setSavingPause] = useState(false)
	const [now, setNow] = useState(Date.now())

	// As consultas continuam entre renderizações: o último status e o timer ficam fora do estado
	const statusRef = useRef<ScraperStatus | null>(null)
	const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const mounted = useRef(false)

	async function refreshStatus() {
		clearTimeout(pollTimer.current)
		const wasRunning = !!statusRef.current?.current

		try {
			const next = await api.scraperStatus()
			if (!mounted.current) return

			statusRef.current = next
			setStatus(next)
			setStatusError(null)
			// A coleta terminou (ou começou) desde a última consulta: atualiza o histórico
			if (wasRunning !== !!next.current) void loadRuns()
		} catch (error) {
			if (!mounted.current) return
			setStatusError((error as Error).message)
		}

		clearTimeout(pollTimer.current)
		pollTimer.current = setTimeout(refreshStatus, statusRef.current?.current ? POLL_RUNNING_MS : POLL_IDLE_MS)
	}

	async function loadRuns(more = false) {
		if (!more) setRunsState('loading')

		try {
			const page = await api.runs(more ? runsCursor : null)
			if (!mounted.current) return

			setRuns(current => (more ? [...current, ...page.runs] : page.runs))
			setRunsCursor(page.nextCursor)
			setRunsState('ready')
		} catch {
			if (mounted.current) setRunsState('error')
		}
	}

	async function runNow() {
		setRequesting(true)
		try {
			await api.runNow()
			notify('Coleta solicitada. Ela começa em instantes (se o scraper estiver rodando).')
			setTimeout(() => mounted.current && refreshStatus(), 2_000)
		} catch (error) {
			notify((error as RequestError).message, 'error')
		} finally {
			setRequesting(false)
		}
	}

	async function setPaused(paused: boolean) {
		setSavingPause(true)
		try {
			const settings = await api.saveSettings('scraper', { paused })
			setStatus(current => current && { ...current, paused: settings.paused })
			notify(paused ? 'Coletas automáticas pausadas' : 'Coletas automáticas retomadas')
			void refreshStatus()
		} catch (error) {
			notify(`Não consegui salvar: ${(error as Error).message}`, 'error')
		} finally {
			setSavingPause(false)
		}
	}

	useEffect(() => {
		mounted.current = true
		void refreshStatus()
		void loadRuns()
		const clock = setInterval(() => setNow(Date.now()), 1000)

		return () => {
			mounted.current = false
			clearTimeout(pollTimer.current)
			clearInterval(clock)
		}
	}, [])

	function toggle(id: string) {
		setExpanded(current => {
			const next = new Set(current)
			if (!next.delete(id)) next.add(id)
			return next
		})
	}

	function renderCurrent() {
		if (!status) {
			return statusError ? (
				<EmptyState tone="error" title="Não consegui ler o status do scraper" description={statusError} />
			) : (
				<Skeleton className="card min-h-60" aria-busy="true" />
			)
		}

		const running = status.current
		const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : null

		return (
			<div className="status-grid">
				<section className="status-card inverted" aria-live="polite">
					<div className="row-between wrap">
						<div className="row gap-sm">
							<Badge tone={running ? 'lime' : status.paused ? 'muted' : 'ok'}>
								{running ? 'em andamento' : status.paused ? 'pausada' : 'ociosa'}
							</Badge>
							{running && (
								<span className="mono xsmall text-muted">
									{TRIGGERS[running.trigger].toLowerCase()} · iniciada {formatDateTime(running.startedAt)}
								</span>
							)}
						</div>
						{running && <span className="mono status-clock">{formatDuration(now - new Date(running.startedAt).getTime())}</span>}
					</div>

					{running ? (
						<p className="text-muted small">
							Buscando os posts de cada termo ativo e enviando para a IA. Uma coleta leva de 2 a 10 minutos; o resultado por
							termo aparece no histórico quando ela terminar.
						</p>
					) : (
						<div>
							<p className="text-muted small">próxima coleta automática</p>
							<p className="mono status-next">
								{status.paused
									? 'coletas pausadas'
									: next !== null && next > 0
										? `em ${formatDuration(next)}`
										: 'a qualquer momento'}
							</p>
						</div>
					)}

					<div className="row-between wrap">
						<span className="mono xsmall text-muted">
							{status.paused ? '“coletar agora” continua funcionando' : formatInterval(status.intervalMinutes)}
						</span>
						<Button
							variant="lime"
							size="lg"
							// No card escuro, o lime apagado sumia: desativado, o botão fica na cor da borda
							className="disabled:bg-line disabled:text-muted disabled:opacity-100"
							disabled={!!running || requesting}
							onClick={runNow}
						>
							<Icon name={running ? 'spinner' : 'refresh'} />
							{running ? 'coletando…' : requesting ? 'pedindo…' : 'coletar agora'}
						</Button>
					</div>
				</section>

				<section className="card stack-sm">
					<h2 className="label">agenda_</h2>
					<SwitchField
						id="runs-paused"
						title="pausar coletas automáticas"
						description="o intervalo para de contar até você retomar"
						checked={status.paused}
						disabled={savingPause}
						onChange={setPaused}
					/>
					{status.last && (
						<p className="muted small">
							última coleta: {formatDateTime(status.last.startedAt)} ·{' '}
							{status.last.status === 'success' ? lastRunSummary(status.last) : 'falhou'}
						</p>
					)}
					<TextLink className="small" href="/configuracoes" onClick={onLinkClick}>
						editar termos e intervalo
					</TextLink>
				</section>
			</div>
		)
	}

	return (
		<div className="page">
			<section className="hero">
				<div>
					<h1 className="display">
						coletas <span className="mono display-mono">do scraper.</span>
					</h1>
					<p className="muted lead">Histórico dos últimos 90 dias. Cada coleta busca posts por termo e manda para a IA.</p>
				</div>
			</section>

			<FailureAlert status={status} />
			{renderCurrent()}

			<section className="stack-sm">
				<div className="row-between wrap">
					<h2 className="section-title">
						histórico <span className="mono">de coletas</span>
					</h2>
					<span className="mono muted xsmall">posts novos vão para a IA; vagas novas são as salvas a partir deles</span>
				</div>

				{runsState === 'error' && (
					<EmptyState
						tone="error"
						title="Não consegui carregar o histórico"
						action={
							<Button variant="lime" onClick={() => loadRuns()}>
								tentar de novo
							</Button>
						}
					/>
				)}
				{runsState === 'loading' && <Skeleton className="card min-h-60" aria-busy="true" />}
				{runsState === 'ready' && runs.length === 0 && (
					<EmptyState
						title="Nenhuma coleta nos últimos 90 dias"
						description="Use “coletar agora” ou rode o scraper com SCRAPER_INTERVAL_MINUTES maior que 0."
					/>
				)}
				{runsState === 'ready' && runs.length > 0 && (
					<div className="card table-wrap">
						<table className="runs-table">
							<thead>
								<tr>
									<th scope="col">status</th>
									<th scope="col">gatilho</th>
									<th scope="col">início</th>
									<th scope="col">duração</th>
									<th scope="col">posts novos</th>
									<th scope="col">vagas novas</th>
									<th scope="col">termos</th>
									<th scope="col">
										<span className="sr-only">detalhes</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{runs.map(run => (
									<RunRows key={run.id} run={run} open={expanded.has(run.id)} onToggle={() => toggle(run.id)} />
								))}
							</tbody>
						</table>
					</div>
				)}
				{runsCursor && (
					<Button variant="ghost" className="center" onClick={() => loadRuns(true)}>
						carregar coletas anteriores
					</Button>
				)}
			</section>
		</div>
	)
}
