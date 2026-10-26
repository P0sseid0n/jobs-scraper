import { useEffect, useId, useRef, useState } from 'react'

import type { RunsPage, RunsPageSize, ScraperStatus, WebScraperRun, WebScraperRunTerm } from '../../api-types'
import { api, type RequestError } from '../api'
import { Icon } from '../components/Icon'
import { Badge, badge, BadgeList, type BadgeTone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { CodeBlock } from '../components/ui/CodeBlock'
import { EmptyState } from '../components/ui/EmptyState'
import { iconButton, IconButton } from '../components/ui/IconButton'
import { Notice } from '../components/ui/Notice'
import { Hero, Page } from '../components/ui/Page'
import { RollingNumber } from '../components/ui/RollingNumber'
import { SelectMenu } from '../components/ui/SelectMenu'
import { Skeleton } from '../components/ui/Skeleton'
import { StatusDot, type StatusDotTone } from '../components/ui/StatusDot'
import { SwitchField } from '../components/ui/Switch'
import { LABEL, SECTION_TITLE } from '../components/ui/text'
import { RouteLink, TextLink } from '../components/ui/TextLink'
import { cx } from '../lib/cx'
import { formatDateTime, formatDuration, formatInterval } from '../lib/format'
import { pageItems } from '../lib/pagination'
import { useStore } from '../lib/store'
import { RUNS_PAGE_SIZE_OPTIONS, runsPageSize } from '../stores/runs-page-size'
import { copyText, notify } from '../stores/toast'

/** Como a coleta começou, em palavras de quem usa o site. */
const TRIGGERS: Record<WebScraperRun['trigger'], string> = {
	schedule: 'Automática',
	manual: 'Pedida por você',
	once: 'Execução única',
}

/** A falha que não foi no login: a mensagem do erro fica no "ver o erro completo". */
const UNEXPECTED_FAILURE = 'A coleta parou por um erro inesperado. A próxima tenta de novo sozinha.'

/** O que o post-processing fez com cada post, na ordem em que os filtros rodam. */
const OUTCOMES: Record<keyof NonNullable<WebScraperRun['outcomes']>['counts'], string> = {
	saved: 'viraram vaga',
	'multi-job': 'listas de vagas (abertas uma a uma)',
	language: 'idioma fora dos aceitos',
	'job-seeker': 'candidato procurando vaga',
	'not-a-job': 'não são vaga, segundo a IA',
	keywords: 'fora das palavras-chave',
	'missing-fields': 'sem cargo ou link do post',
	unknown: 'processados por uma versão anterior',
}

// Não são descarte: as listas têm as vagas abertas à parte, e os posts sem destino registrado podem ter virado vaga
const NOT_DISCARDED = new Set(['saved', 'multi-job', 'unknown'])

/**
 * Se a coleta terminou sem completar o mínimo de vagas (as buscas acabaram antes), depois de a IA ler toda a fila.
 * As vagas das listas, abertas depois da coleta, também contam aqui.
 */
function belowMinimum(run: WebScraperRun) {
	if (run.status !== 'success' || run.minJobs === null || run.newJobs === null) return false
	return (run.outcomes?.pending ?? 0) === 0 && run.newJobs < run.minJobs
}

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

/** O que mostrar quando a busca de um termo não trouxe posts, pelo tipo do erro. */
const TERM_ERRORS: Record<NonNullable<WebScraperRunTerm['errorKind']>, { title: string; hint: string }> = {
	empty: { title: 'sem resultados', hint: 'O LinkedIn não achou posts para este termo. Tente outro termo ou um período maior.' },
	'no-posts': { title: 'nenhum post', hint: 'A busca veio vazia ou o LinkedIn mudou a página.' },
	timeout: { title: 'não carregou', hint: 'O LinkedIn demorou demais para responder. A próxima coleta tenta de novo.' },
	unknown: { title: 'erro inesperado', hint: 'Algo deu errado nesta busca; os detalhes ajudam a investigar.' },
}

// Células da tabela de coletas: a borda fica na linha, e a última linha não tem
const ROW = 'border-b border-line last:border-b-0'
const TH = 'px-4 py-3 text-left font-mono font-normal whitespace-nowrap text-muted'
const TD = 'px-4 py-3.5 align-top whitespace-nowrap'

const POLL_RUNNING_MS = 5_000
const POLL_IDLE_MS = 30_000
/** Quanto o "coletar agora" fica travado esperando a coleta pedida começar (o scraper pode estar desligado). */
const START_TIMEOUT_MS = 30_000

/** A coleta que parou no login, explicada sem os detalhes técnicos (que ficam no "detalhes" do aviso). */
const LOGIN_FAILURES: Record<NonNullable<WebScraperRun['loginFailure']>, { title: string; hint: string; test: boolean }> = {
	verification: {
		title: 'O LinkedIn pediu uma confirmação, e ela não foi feita a tempo',
		hint: 'Teste o login: a confirmação abre numa janela aqui no site, para aprovar no app do celular ou digitar o código.',
		test: true,
	},
	captcha: {
		title: 'O LinkedIn pediu um captcha',
		hint: 'O captcha só aparece numa janela do navegador, que o scraper no Docker não abre. Espere algumas horas e teste o login de novo, ou informe em Configurações › Contas o cookie li_at de uma sessão aberta no seu navegador.',
		test: true,
	},
	credentials: {
		title: 'O LinkedIn não aceitou o e-mail ou a senha',
		hint: 'Confira a conta em Configurações › Contas e teste o login.',
		test: false,
	},
	'no-account': {
		title: 'Falta a conta do LinkedIn',
		hint: 'Informe o e-mail e a senha em Configurações › Contas.',
		test: false,
	},
	other: {
		title: 'Não deu para entrar no LinkedIn',
		hint: 'Teste o login para ver o que o LinkedIn está pedindo.',
		test: true,
	},
}

function FailureAlert({ status }: { status: ScraperStatus | null }) {
	const [testing, setTesting] = useState(false)
	const last = status?.last
	if (last?.status !== 'failed' || status?.current) return null

	const login = last.loginFailure ? LOGIN_FAILURES[last.loginFailure] : null

	async function testLogin() {
		setTesting(true)
		try {
			await api.testLinkedinLogin()
			notify('Testando o login do LinkedIn. Se ele pedir uma confirmação, ela abre aqui.')
		} catch (error) {
			notify(`Não consegui pedir o teste: ${(error as Error).message}`, 'error')
		} finally {
			setTesting(false)
		}
	}

	return (
		<Notice tone="danger" size="lg" icon="alert">
			<p className="font-semibold">{login?.title ?? 'A última coleta falhou'}</p>
			<p className="text-sm">
				{formatDateTime(last.startedAt)} ·{' '}
				{login ? `${login.hint} Até lá, as coletas não entram no LinkedIn.` : UNEXPECTED_FAILURE}
			</p>
			{login && (
				<div className="flex flex-wrap items-center gap-3 pt-1">
					{login.test && (
						<Button variant="lime" size="sm" onClick={testLogin} disabled={testing}>
							{testing ? 'pedindo…' : 'testar o login'}
						</Button>
					)}
					<RouteLink to="/configuracoes">abrir configurações › contas</RouteLink>
				</div>
			)}
			{last.error && (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted">ver o erro completo</summary>
					<p className="mt-1 font-mono break-all">{last.error}</p>
				</details>
			)}
		</Notice>
	)
}

/** Sem termos de busca ativos, o scraper não coleta: a tela diz o que falta e onde configurar. */
function NoSearchTermsAlert({ status }: { status: ScraperStatus }) {
	if (status.activeSearchTerms > 0 || status.current) return null

	return (
		<Notice tone="warn" size="lg" icon="alert">
			<p className="font-semibold">Configure os termos de busca</p>
			<p className="text-sm">
				Sem nenhum termo ativo, o scraper fica em espera e não coleta.{' '}
				<RouteLink to="/configuracoes">adicionar termos em configurações</RouteLink>
			</p>
		</Notice>
	)
}

/** Sem conta do LinkedIn (no site ou no `.env`), o scraper não coleta: a tela diz onde conectar. */
function NoLinkedinAccountAlert({ status }: { status: ScraperStatus }) {
	if (status.linkedinAccount || status.current) return null

	return (
		<Notice tone="warn" size="lg" icon="alert">
			<p className="font-semibold">Conecte sua conta do LinkedIn</p>
			<p className="text-sm">
				Sem o e-mail e a senha do LinkedIn, o scraper fica em espera e não coleta. A coleta começa sozinha depois de salvar.{' '}
				<RouteLink to="/configuracoes">conectar em configurações › contas</RouteLink>
			</p>
		</Notice>
	)
}

/** "3 posts novos · 1 vaga nova", ou o aviso de que a busca só trouxe posts já processados ou em outro idioma. */
function lastRunSummary(run: WebScraperRun) {
	if (run.sent === 0) {
		const ignored = [run.skipped > 0 && `${run.skipped} já vistos`, run.otherLanguage > 0 && `${run.otherLanguage} em outro idioma`]
		const reasons = ignored.filter(Boolean).join(', ')
		return reasons ? `nenhum post novo (${reasons})` : 'nenhum post encontrado'
	}

	const posts = `${run.sent} ${run.sent === 1 ? 'post novo' : 'posts novos'}`
	if (run.newJobs === null) return posts
	return `${posts} · ${run.newJobs} ${run.newJobs === 1 ? 'vaga nova' : 'vagas novas'}`
}

function TermCard({ term }: { term: WebScraperRunTerm }) {
	if (!term.error) {
		return (
			<li className={card({ size: 'sm', className: 'flex flex-col gap-1.5' })}>
				<span className="font-mono text-muted text-xs">{term.term}</span>
				<span className="font-mono text-lg">
					{term.sent} novos{term.skipped > 0 && <span className="text-muted"> · {term.skipped} já vistos</span>}
					{term.otherLanguage > 0 && <span className="text-muted"> · {term.otherLanguage} em outro idioma</span>}
				</span>
			</li>
		)
	}

	// Busca sem resultados não é falha: aviso em amarelo, sem os detalhes técnicos
	const empty = term.errorKind === 'empty'
	const { title, hint } = TERM_ERRORS[term.errorKind ?? 'unknown']

	return (
		<li
			className={card({
				size: 'sm',
				failed: !empty,
				className: cx('flex flex-col gap-1.5', empty ? 'bg-warn-bg' : 'bg-danger-bg'),
			})}
		>
			<span className="flex items-center gap-1.5 font-mono text-muted text-xs">
				<Icon name="alert" size={12} className={empty ? 'text-warn' : 'text-danger'} />
				{term.term}
			</span>
			<span className={cx('font-mono text-lg', empty ? 'text-warn' : 'text-danger')}>{empty ? title : `falhou · ${title}`}</span>
			<p className="m-0 text-sm">{hint}</p>
			{term.searchUrl && (
				<TextLink href={term.searchUrl} external className="self-start text-sm">
					abrir busca no LinkedIn
				</TextLink>
			)}
			{!empty && (
				<details className="text-xs">
					<summary className="cursor-pointer text-muted">ver o erro completo</summary>
					<CodeBlock label="erro original" onCopy={() => copyText(term.error ?? '', 'Erro')} className="mt-1.5">
						{term.error}
					</CodeBlock>
				</details>
			)}
		</li>
	)
}

/**
 * A coleta em andamento, ao vivo (o status é relido a cada 5 s): os números rolam como num odômetro, e cada termo tem a
 * barra dele: cheia quando terminou, com uma faixa correndo no que está sendo coletado agora e vazia nos que faltam.
 */
function LiveRun({ run }: { run: WebScraperRun }) {
	const done = run.terms.length
	const counters = [
		{ label: 'posts novos', value: run.sent },
		{ label: 'vagas novas', value: run.newJobs ?? 0 },
		{ label: 'descartados', value: discarded(run) },
	]

	return (
		<div className="flex flex-col gap-5">
			<p className="text-muted text-sm">
				Buscando os posts de cada termo e enviando para a IA. Uma coleta leva de 2 a 10 minutos; as vagas novas continuam chegando
				enquanto a IA lê a fila.
			</p>
			<dl className="m-0 grid grid-cols-3 gap-4">
				{counters.map(counter => (
					<div key={counter.label} className="flex flex-col gap-1">
						<dt className="font-mono text-xs text-muted">{counter.label}</dt>
						<dd className="m-0 font-mono text-3xl">
							<RollingNumber value={counter.value} />
						</dd>
					</div>
				))}
			</dl>
			<ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Termos da coleta">
				{run.plannedTerms.map((term, index) => {
					const result = run.terms[index]
					const state = index < done ? 'done' : index === done ? 'current' : 'upcoming'
					const failed = !!result?.error && result.errorKind !== 'empty'

					return (
						<li key={`${index}-${term}`} className="flex flex-col gap-1.5">
							<div className="flex items-center justify-between gap-3 font-mono text-xs">
								<span className={cx('flex min-w-0 items-center gap-2', state === 'upcoming' && 'text-muted')}>
									{state === 'current' && <StatusDot tone="lime" glow pulse />}
									<span className="truncate">{term}</span>
								</span>
								<span className={cx('shrink-0', failed ? 'text-danger' : 'text-muted')}>
									{state === 'done'
										? failed
											? 'falhou'
											: result?.errorKind === 'empty'
												? 'sem resultados'
												: `${result?.sent ?? 0} novos`
										: state === 'current'
											? 'coletando…'
											: 'a seguir'}
								</span>
							</div>
							<span className="relative h-1 overflow-hidden rounded-pill bg-line" aria-hidden="true">
								{/* A mesma barra do começo ao fim: ao terminar o termo, ela enche */}
								<span
									className={cx(
										'block h-full origin-left rounded-pill transition-transform duration-700 ease-glide motion-reduce:transition-none',
										failed ? 'bg-danger' : 'bg-lime-accent',
										state === 'done' ? 'scale-x-100' : 'scale-x-0',
									)}
								/>
								{state === 'current' && (
									<span className="absolute inset-y-0 left-0 w-2/5 rounded-pill bg-lime-accent animate-sweep motion-reduce:animate-none" />
								)}
							</span>
						</li>
					)
				})}
			</ol>
		</div>
	)
}

/** A falha que não foi no login, resumida: o erro de uma biblioteca (do navegador, do banco) não vai para a tabela. */
function failureSummary(run: WebScraperRun) {
	// As duas mensagens do próprio scraper (`run-history.ts`) já são para pessoas
	if (run.error === 'Todas as buscas falharam') return 'todas as buscas falharam'
	if (run.error?.startsWith('Coleta interrompida')) return 'interrompida: o serviço foi reiniciado no meio'
	return 'parou por um erro inesperado'
}

function RunRows({ run, open, onToggle }: { run: WebScraperRun; open: boolean; onToggle: () => void }) {
	const failedTerms = run.terms.filter(term => term.error && term.errorKind !== 'empty').length
	const emptyTerms = run.terms.filter(term => term.errorKind === 'empty').length
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
					{run.otherLanguage > 0 && <span className="text-muted text-xs"> · {run.otherLanguage} em outro idioma</span>}
				</td>
				<td className={cx(TD, 'font-mono')}>
					{run.newJobs ?? '–'}
					{belowMinimum(run) && <span className="text-muted text-xs"> · mínimo de {run.minJobs}</span>}
					{discarded(run) > 0 && <span className="text-muted text-xs"> · {discarded(run)} descartados</span>}
					{(run.outcomes?.pending ?? 0) > 0 && <span className="text-muted text-xs"> · {run.outcomes?.pending} na fila</span>}
				</td>
				<td
					className={cx(TD, 'max-w-85 whitespace-normal', (run.error || failedTerms > 0) && 'text-danger')}
					// A mensagem original do erro, para quem quiser ver (o texto da célula é o resumo)
					title={run.status === 'failed' ? (run.error ?? undefined) : undefined}
				>
					{run.error && run.status === 'failed'
						? run.loginFailure
							? LOGIN_FAILURES[run.loginFailure].title
							: failureSummary(run)
						: run.terms.length > 0
							? [
									`${run.terms.length - failedTerms} de ${run.terms.length}`,
									failedTerms > 0 && `${failedTerms} com falha`,
									emptyTerms > 0 && `${emptyTerms} sem resultados`,
								]
									.filter(Boolean)
									.join(' · ')
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
								<TermCard key={term.term} term={term} />
							))}
						</ul>
						{run.outcomes && run.sent > 0 && (
							<div className="mt-3 flex flex-col gap-1.5">
								<span className={LABEL}>destino dos posts novos</span>
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

const PAGE_SIZE_OPTIONS = RUNS_PAGE_SIZE_OPTIONS.map(size => ({ value: String(size), label: String(size) }))

/** Rodapé do histórico: quantas coletas por página, quais estão na tela e as setas de página. */
function RunsPagination({
	page,
	pageSize,
	total,
	onPage,
	onPageSize,
}: {
	page: number
	pageSize: RunsPageSize
	total: number
	onPage: (page: number) => void
	onPageSize: (size: RunsPageSize) => void
}) {
	const sizeId = useId()
	const pages = Math.max(1, Math.ceil(total / pageSize))
	const first = (page - 1) * pageSize + 1
	const last = Math.min(page * pageSize, total)

	return (
		<nav
			aria-label="páginas do histórico"
			className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"
		>
			<div className="flex items-center gap-2">
				<label htmlFor={sizeId} className="font-mono text-muted text-xs">
					por página
				</label>
				<SelectMenu
					id={sizeId}
					size="sm"
					className="w-20"
					value={String(pageSize)}
					options={PAGE_SIZE_OPTIONS}
					onChange={value => onPageSize(Number(value) as RunsPageSize)}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="font-mono text-muted text-xs" aria-live="polite">
					<span aria-hidden="true">
						{first}–{last} de {total}
					</span>
					<span className="sr-only">
						coletas {first} a {last} de {total}
						{pages > 1 && `, página ${page} de ${pages}`}
					</span>
				</span>
				{/* Tudo numa página só: sem botões */}
				{pages > 1 && (
					<div className="flex items-center gap-1">
						<PageArrow label="primeira página" icon="first" target={1} current={page} onPage={onPage} />
						<PageArrow label="página anterior" icon="back" target={page - 1} current={page} onPage={onPage} />
						{pageItems(page, pages).map(item =>
							typeof item === 'number' ? (
								<button
									key={item}
									type="button"
									aria-label={`página ${item}`}
									aria-current={item === page ? 'page' : undefined}
									className={iconButton({
										size: 'sm',
										bordered: true,
										className: cx(
											'font-mono text-xs',
											// A atual não reage ao mouse: o hover dos botões com borda trocava o fundo escuro pelo claro, e o
											// número sumia. No celular só cabe ela, entre as setas
											item === page ? 'pointer-events-none border-ink bg-ink text-bg' : 'max-md:hidden',
										),
									})}
									onClick={() => item !== page && onPage(item)}
								>
									{item}
								</button>
							) : (
								<span key={item} aria-hidden="true" className="w-6 text-center font-mono text-muted text-xs max-md:hidden">
									…
								</span>
							),
						)}
						<PageArrow label="próxima página" icon="back" flip target={page + 1} current={page} pages={pages} onPage={onPage} />
						<PageArrow label="última página" icon="first" flip target={pages} current={page} pages={pages} onPage={onPage} />
					</div>
				)}
			</div>
		</nav>
	)
}

/**
 * Seta da paginação. Sem destino (já na primeira ou na última), fica `aria-disabled` em vez de `disabled`: continua
 * focável, e o foco não some quando a página chega ao fim pelo teclado.
 */
function PageArrow({
	label,
	icon,
	flip = false,
	target,
	current,
	pages = Number.POSITIVE_INFINITY,
	onPage,
}: {
	label: string
	icon: 'back' | 'first'
	flip?: boolean
	target: number
	current: number
	pages?: number
	onPage: (page: number) => void
}) {
	const unavailable = target === current || target < 1 || target > pages
	return (
		<IconButton
			label={label}
			size="sm"
			bordered
			aria-disabled={unavailable || undefined}
			onClick={() => !unavailable && onPage(target)}
		>
			<Icon name={icon} className={cx(flip && 'rotate-180')} />
		</IconButton>
	)
}

/** Acompanhamento do scraper: coleta em andamento, próxima agendada, "coletar agora" e histórico. */
/** O status e a primeira página do histórico vêm do loader da rota (`routes/coletas.tsx`); daqui em diante a tela consulta sozinha. */
export function RunsView({ initial }: { initial: { status: ScraperStatus; runs: RunsPage } }) {
	const [status, setStatus] = useState(initial.status)
	const [runs, setRuns] = useState<WebScraperRun[]>(initial.runs.runs)
	const [runsTotal, setRunsTotal] = useState(initial.runs.total)
	const [page, setPage] = useState(1)
	const pageSize = useStore(runsPageSize)
	const [runsState, setRunsState] = useState<'loading' | 'ready' | 'error'>('ready')
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
	const [requesting, setRequesting] = useState(false)
	// Coleta pedida que ainda não apareceu no status: o botão continua travado (senão dava para pedir de novo)
	const [starting, setStarting] = useState(false)
	const [savingPause, setSavingPause] = useState(false)
	const [now, setNow] = useState(Date.now())

	// As consultas continuam entre renderizações: o último status e o timer ficam fora do estado
	const statusRef = useRef(initial.status)
	const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
	const mounted = useRef(false)
	/** Até quando esperar a coleta pedida começar; 0 sem pedido pendente. */
	const startingUntil = useRef(0)
	// A página que o histórico mostra, para a consulta do status recarregar a mesma; e a última página pedida, para
	// descartar a resposta de uma anterior que chegue depois
	const pageRef = useRef(1)
	const runsRequest = useRef(0)

	async function refreshStatus() {
		clearTimeout(pollTimer.current)
		const wasRunning = !!statusRef.current?.current

		try {
			const next = await api.scraperStatus()
			if (!mounted.current) return

			statusRef.current = next
			setStatus(next)
			// A coleta pedida começou (ou cansou de esperar): o botão volta a seguir só o status
			if (startingUntil.current && (next.current || Date.now() >= startingUntil.current)) {
				startingUntil.current = 0
				setStarting(false)
			}
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
		const fast = statusRef.current.current || startingUntil.current
		pollTimer.current = setTimeout(refreshStatus, fast ? POLL_RUNNING_MS : POLL_IDLE_MS)
	}

	async function loadRuns(target = pageRef.current, size = runsPageSize.get()) {
		const request = ++runsRequest.current
		setRunsState('loading')

		try {
			const result = await api.runs(target, size)
			if (!mounted.current || request !== runsRequest.current) return

			// A página passou do fim (coletas antigas saíram do histórico): mostra a última
			const last = Math.max(1, Math.ceil(result.total / size))
			if (target > last) return void loadRuns(last, size)

			pageRef.current = target
			setPage(target)
			setRuns(result.runs)
			setRunsTotal(result.total)
			setRunsState('ready')
		} catch {
			if (mounted.current && request === runsRequest.current) setRunsState('error')
		}
	}

	// Outro tamanho: abre na página que tem a primeira coleta que estava na tela
	function changePageSize(size: RunsPageSize) {
		const first = (pageRef.current - 1) * runsPageSize.get()
		runsPageSize.set(size)
		void loadRuns(Math.floor(first / size) + 1, size)
	}

	async function runNow() {
		setRequesting(true)
		try {
			await api.runNow()
			startingUntil.current = Date.now() + START_TIMEOUT_MS
			setStarting(true)
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

	// Ao voltar para a tela, o router mostra o loader da visita anterior e recarrega por trás: quando os dados novos
	// chegam, substituem os da tela (senão a coleta iniciada depois da visita anterior sumia até a próxima consulta)
	const shownInitial = useRef(initial)
	useEffect(() => {
		if (shownInitial.current === initial) return
		shownInitial.current = initial

		statusRef.current = initial.status
		setStatus(initial.status)
		// O loader traz a primeira página
		runsRequest.current++
		pageRef.current = 1
		setPage(1)
		setRuns(initial.runs.runs)
		setRunsTotal(initial.runs.total)
		setRunsState('ready')
		clearTimeout(pollTimer.current)
		schedulePoll()
	}, [initial])

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
		const noTerms = status.activeSearchTerms === 0
		const noAccount = !status.linkedinAccount
		// Sem termos ou sem conta não dá para coletar; esperando a primeira coleta, o "coletar agora" é o caminho
		const waiting = noTerms || noAccount
		const firstRun = status.awaitingFirstRun

		return (
			<div className="flex flex-wrap gap-4">
				<section className={card({ size: 'lg', className: 'flex grow-2 basis-130 flex-col gap-5' })} aria-live="polite">
					<div className="flex items-center justify-between gap-3 flex-wrap">
						<div className="flex items-center gap-2.5">
							<Badge tone={running ? 'lime' : status.paused || waiting || firstRun ? 'muted' : 'ok'}>
								{running ? 'em andamento' : status.paused ? 'pausada' : waiting || firstRun ? 'em espera' : 'ociosa'}
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

					{running && running.plannedTerms.length > 0 ? (
						<LiveRun run={running} />
					) : running ? (
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
									: noTerms
										? 'sem termos de busca'
										: noAccount
											? 'sem conta do LinkedIn'
											: firstRun
												? 'depois da primeira'
												: next !== null && next > 0
													? `em ${formatDuration(next)}`
													: 'a qualquer momento'}
							</p>
						</div>
					)}

					<div className="flex items-center justify-between gap-3 flex-wrap">
						<span className="font-mono text-xs text-muted">
							{noTerms
								? 'adicione um termo para coletar'
								: noAccount
									? 'conecte sua conta do LinkedIn'
									: firstRun
										? 'a primeira coleta começa quando você pedir'
										: status.paused
											? '“coletar agora” continua funcionando'
											: formatInterval(status.intervalMinutes)}
						</span>
						<Button variant="lime" size="lg" disabled={!!running || requesting || starting || waiting} onClick={runNow}>
							<Icon name={running || starting ? 'spinner' : 'refresh'} />
							{running ? 'coletando…' : requesting ? 'pedindo…' : starting ? 'iniciando…' : 'coletar agora'}
						</Button>
					</div>
				</section>

				<section className={card({ size: 'lg', className: 'flex flex-1 basis-70 flex-col gap-2.5' })}>
					<h2 className={LABEL}>agenda</h2>
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
			<NoSearchTermsAlert status={status} />
			<NoLinkedinAccountAlert status={status} />
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
				{runsState === 'loading' && runs.length === 0 && <Skeleton className={card({ className: 'min-h-60' })} aria-busy="true" />}
				{runsState === 'ready' && runs.length === 0 && (
					<EmptyState
						illustration="runs"
						title="Nenhuma coleta nos últimos 90 dias"
						description="Use “coletar agora” para fazer a primeira; depois, elas seguem o intervalo."
					/>
				)}
				{runsState !== 'error' && runs.length > 0 && (
					<div className={card()}>
						{/* Trocando de página, a tabela continua na tela, apagada, até a nova chegar (sem pular a altura); só ela
						    rola de lado no celular, a paginação fica fixa embaixo */}
						<div
							className={cx('overflow-x-auto transition-opacity', runsState === 'loading' && 'opacity-60')}
							aria-busy={runsState === 'loading'}
						>
							<table className="w-full min-w-205 border-collapse">
								<thead className="text-xs">
									<tr className="border-b border-line">
										<th scope="col" className={TH}>
											status
										</th>
										<th scope="col" className={TH}>
											origem
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
						<RunsPagination
							page={page}
							pageSize={pageSize}
							total={runsTotal}
							onPage={target => void loadRuns(target)}
							onPageSize={changePageSize}
						/>
					</div>
				)}
			</section>
		</Page>
	)
}
