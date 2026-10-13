import { useEffect, useRef, useState } from 'react'

import type { RunsPage, ScraperStatus, WebScraperRun } from '../../api-types'
import { api, type RequestError } from '../api'
import { Icon } from '../components/Icon'
import { Badge, badge, BadgeList, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Notice } from '../components/ui/Notice'
import { Hero, Page } from '../components/ui/Page'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusDot, type StatusDotTone } from '../components/ui/StatusDot'
import { SwitchField } from '../components/ui/Switch'
import { LABEL, SECTION_TITLE } from '../components/ui/text'
import { RouteLink } from '../components/ui/TextLink'
import { cx } from '../lib/cx'
import { formatDateTime, formatDuration, formatInterval, isLoginFailure } from '../lib/format'
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

// Células da tabela de coletas: a borda fica na linha, e a última linha não tem
const ROW = 'border-b border-line last:border-b-0'
const TH = 'px-4 py-3 text-left font-mono font-normal whitespace-nowrap text-muted'
const TD = 'px-4 py-3.5 align-top whitespace-nowrap'

const POLL_RUNNING_MS = 5_000
const POLL_IDLE_MS = 30_000

function FailureAlert({ status }: { status: ScraperStatus | null }) {
	const last = status?.last
	if (last?.status !== 'failed' || status?.current) return null

	const login = isLoginFailure(last.error)

	return (
		<Notice tone="danger" size="lg" icon="alert">
			<p className="font-semibold">{login ? 'Ação necessária: o LinkedIn pediu verificação' : 'A última coleta falhou'}</p>
			<p className="text-sm">
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
			<tr className={ROW}>
				<td className={TD}>
					<Badge tone={RUN_STATUS[run.status].tone}>
						<StatusDot tone={RUN_STATUS[run.status].dot} />
						{RUN_STATUS[run.status].label}
					</Badge>
				</td>
				<td className={TD}>{TRIGGERS[run.trigger]}</td>
				<td className={cx(TD, 'font-mono')}>{formatDateTime(run.startedAt)}</td>
				<td className={cx(TD, 'font-mono')}>{duration}</td>
				<td className={cx(TD, 'font-mono')}>
					{run.sent}
					{run.skipped > 0 && <span className="text-muted text-xs"> · {run.skipped} já vistos</span>}
				</td>
				<td className={cx(TD, 'font-mono')}>
					{run.newJobs ?? '–'}
					{discarded(run) > 0 && <span className="text-muted text-xs"> · {discarded(run)} descartados</span>}
					{(run.outcomes?.pending ?? 0) > 0 && <span className="text-muted text-xs"> · {run.outcomes?.pending} na fila</span>}
				</td>
				<td className={cx(TD, 'max-w-85 whitespace-normal', (run.error || failedTerms > 0) && 'text-danger')}>
					{run.error && run.status === 'failed'
						? run.error
						: run.terms.length > 0
							? `${run.terms.length - failedTerms} de ${run.terms.length}${failedTerms ? ` · ${failedTerms} com falha` : ''}`
							: '–'}
				</td>
				<td className={TD}>
					{run.terms.length > 0 && (
						<Button variant="ghost" size="xs" aria-expanded={open} onClick={onToggle}>
							{open ? 'recolher' : 'detalhar'}
						</Button>
					)}
				</td>
			</tr>
			{open && (
				<tr className={ROW}>
					<td colSpan={8} className={cx(TD, 'bg-surface-2 whitespace-normal')}>
						<ul className="m-0 grid list-none grid-cols-fill-55 gap-2.5 p-0">
							{run.terms.map(term => (
								<li key={term.term} className={card({ failed: !!term.error, className: 'flex flex-col gap-1.5 p-3' })}>
									<span className="font-mono text-muted text-xs">{term.term}</span>
									{term.error ? (
										<span className="text-sm text-danger">falhou: {term.error}</span>
									) : (
										<span className="font-mono text-lg">
											{term.sent} novos{term.skipped > 0 && <span className="text-muted"> · {term.skipped} já vistos</span>}
										</span>
									)}
								</li>
							))}
						</ul>
						{run.outcomes && run.sent > 0 && (
							<div className="mt-3 flex flex-col gap-1.5">
								<span className={LABEL}>destino dos posts novos_</span>
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
/** O status e a primeira página do histórico vêm do loader da rota (`routes/coletas.tsx`); daqui em diante a tela consulta sozinha. */
export function RunsView({ initial }: { initial: { status: ScraperStatus; runs: RunsPage } }) {
	const [status, setStatus] = useState(initial.status)
	const [runs, setRuns] = useState<WebScraperRun[]>(initial.runs.runs)
	const [runsCursor, setRunsCursor] = useState(initial.runs.nextCursor)
	const [runsState, setRunsState] = useState<'loading' | 'ready' | 'error'>('ready')
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
	const [requesting, setRequesting] = useState(false)
	const [savingPause, setSavingPause] = useState(false)
	const [now, setNow] = useState(Date.now())

	// As consultas continuam entre renderizações: o último status e o timer ficam fora do estado
	const statusRef = useRef(initial.status)
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
			// A coleta terminou (ou começou) desde a última consulta: atualiza o histórico
			if (wasRunning !== !!next.current) void loadRuns()
		} catch {
			// Falhou uma consulta: a tela continua com o último status, e a próxima tenta de novo
			if (!mounted.current) return
		}

		clearTimeout(pollTimer.current)
		schedulePoll()
	}

	function schedulePoll() {
		pollTimer.current = setTimeout(refreshStatus, statusRef.current.current ? POLL_RUNNING_MS : POLL_IDLE_MS)
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
			setStatus(current => ({ ...current, paused: settings.paused }))
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
		schedulePoll()
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
		const running = status.current
		const next = status.nextRunAt ? new Date(status.nextRunAt).getTime() - now : null

		return (
			<div className="flex flex-wrap gap-4">
				<section className="inverted flex grow-2 basis-130 flex-col gap-5 rounded-xl p-6" aria-live="polite">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="flex items-center gap-2.5">
							<Badge tone={running ? 'lime' : status.paused ? 'muted' : 'ok'}>
								{running ? 'em andamento' : status.paused ? 'pausada' : 'ociosa'}
							</Badge>
							{running && (
								<span className="font-mono text-xs text-muted">
									{TRIGGERS[running.trigger].toLowerCase()} · iniciada {formatDateTime(running.startedAt)}
								</span>
							)}
						</div>
						{running && (
							<span className="font-mono text-3xl">{formatDuration(now - new Date(running.startedAt).getTime())}</span>
						)}
					</div>

					{running ? (
						<p className="text-muted text-sm">
							Buscando os posts de cada termo ativo e enviando para a IA. Uma coleta leva de 2 a 10 minutos; o resultado por
							termo aparece no histórico quando ela terminar.
						</p>
					) : (
						<div>
							<p className="text-muted text-sm">próxima coleta automática</p>
							<p className="mt-1 font-mono text-3xl">
								{status.paused
									? 'coletas pausadas'
									: next !== null && next > 0
										? `em ${formatDuration(next)}`
										: 'a qualquer momento'}
							</p>
						</div>
					)}

					<div className="flex items-center justify-between gap-3 flex-wrap">
						<span className="font-mono text-xs text-muted">
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

				<section className={card({ className: 'flex flex-1 basis-70 flex-col gap-2.5 p-5.5' })}>
					<h2 className={LABEL}>agenda_</h2>
					<SwitchField
						id="runs-paused"
						title="pausar coletas automáticas"
						description="o intervalo para de contar até você retomar"
						checked={status.paused}
						disabled={savingPause}
						onChange={setPaused}
					/>
					{status.last && (
						<p className="text-muted text-sm">
							última coleta: {formatDateTime(status.last.startedAt)} ·{' '}
							{status.last.status === 'success' ? lastRunSummary(status.last) : 'falhou'}
						</p>
					)}
					<RouteLink className="text-sm" to="/configuracoes">
						editar termos e intervalo
					</RouteLink>
				</section>
			</div>
		)
	}

	return (
		<Page>
			<Hero
				title={
					<>
						coletas <Hero.Mono>do scraper.</Hero.Mono>
					</>
				}
				lead="Histórico dos últimos 90 dias. Cada coleta busca posts por termo e manda para a IA."
			/>

			<FailureAlert status={status} />
			{renderCurrent()}

			<section className="flex flex-col gap-2.5">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<h2 className={SECTION_TITLE}>
						histórico <span className="font-mono font-normal">de coletas</span>
					</h2>
					<span className="font-mono text-muted text-xs">
						posts novos vão para a IA; vagas novas são as salvas a partir deles
					</span>
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
				{runsState === 'loading' && <Skeleton className={card({ className: 'min-h-60' })} aria-busy="true" />}
				{runsState === 'ready' && runs.length === 0 && (
					<EmptyState
						title="Nenhuma coleta nos últimos 90 dias"
						description="Use “coletar agora” ou rode o scraper com SCRAPER_INTERVAL_MINUTES maior que 0."
					/>
				)}
				{runsState === 'ready' && runs.length > 0 && (
					<div className={card({ className: 'overflow-x-auto' })}>
						<table className="w-full min-w-205 border-collapse">
							<thead className="text-xs">
								<tr className="border-b border-line">
									<th scope="col" className={TH}>
										status
									</th>
									<th scope="col" className={TH}>
										gatilho
									</th>
									<th scope="col" className={TH}>
										início
									</th>
									<th scope="col" className={TH}>
										duração
									</th>
									<th scope="col" className={TH}>
										posts novos
									</th>
									<th scope="col" className={TH}>
										vagas novas
									</th>
									<th scope="col" className={TH}>
										termos
									</th>
									<th scope="col" className={TH}>
										<span className="sr-only">detalhes</span>
									</th>
								</tr>
							</thead>
							<tbody className="text-sm">
								{runs.map(run => (
									<RunRows key={run.id} run={run} open={expanded.has(run.id)} onToggle={() => toggle(run.id)} />
								))}
							</tbody>
						</table>
					</div>
				)}
				{runsCursor && (
					<Button variant="ghost" className="self-center" onClick={() => loadRuns(true)}>
						carregar coletas anteriores
					</Button>
				)}
			</section>
		</Page>
	)
}
