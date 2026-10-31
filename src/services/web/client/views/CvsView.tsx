import { Link } from '@tanstack/react-router'
import { useId, useState, type MouseEvent } from 'react'

import { t } from '@shared/i18n'

import type { WebCvBaseVersion, WebCvRequest } from '../../api-types'
import { cvBasePdfUrl, cvPdfUrl } from '../api'
import { Changes, ChangeSummary, hasChanges } from '../components/CvReady'
import { Icon } from '../components/Icon'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { iconButton, IconButton } from '../components/ui/IconButton'
import { SearchInput } from '../components/ui/Input'
import { NEW_TAB } from '../components/ui/link'
import { Hero, Page } from '../components/ui/Page'
import { PdfIcon } from '../components/ui/PdfIcon'
import { LABEL, LIST, META } from '../components/ui/text'
import { TextLink } from '../components/ui/TextLink'
import { activeVersion } from '../lib/cv-base'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { jobParams } from '../router'
import { requestCv, useCvRequests } from '../stores/cv'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'

/** A folha clicável que abre o PDF: sobe um pouco no hover, como os botões. */
const SHEET_LINK =
	'shrink-0 rounded-xs no-underline transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime'

const DAY_MS = 24 * 60 * 60 * 1000
/** Até quanto tempo depois de pronto o "baixar" fica em lime: é a ação do momento; nos outros, é só histórico. */
const JUST_READY_MS = 10 * 60 * 1000

/** O título dos grupos por data: um tamanho acima do `LABEL`, para separar os grupos entre os cards. */
const GROUP_TITLE = cx(LABEL, 'mt-2 text-sm')

/** Para a busca: sem acentos nem maiúsculas ("Sênior" acha "senior"). */
const searchable = (text: string) =>
	text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()

/** Os grupos da lista de gerados, na ordem em que aparecem. */
const DATE_GROUPS = ['today', 'yesterday', 'week', 'month', 'older'] as const
type DateGroup = (typeof DATE_GROUPS)[number]

function dateGroup(iso: string, now: Date): DateGroup {
	const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
	const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)

	if (days <= 0) return 'today'
	if (days === 1) return 'yesterday'
	if (days < 7) return 'week'
	if (days < 30) return 'month'
	return 'older'
}

async function retry(request: WebCvRequest) {
	try {
		await requestCv(request)
	} catch (error) {
		notify(t().cvs.requestFailed((error as Error).message), 'error')
	}
}

type CvItemProps = {
	request: WebCvRequest
	/** Saiu de outra versão do currículo base que não a ativa. */
	outdated: boolean
	/** É o pedido mais recente da vaga: só ele oferece gerar de novo. */
	latest: boolean
}

function CvItem({ request, outdated, latest }: CvItemProps) {
	const c = useT().cvs
	const [expanded, setExpanded] = useState(false)
	const detailsId = useId()

	const ready = request.status === 'ready'
	const justReady = ready && !!request.finishedAt && Date.now() - new Date(request.finishedAt).getTime() < JUST_READY_MS
	const changes = hasChanges(request.changes) ? request.changes : null
	const title = request.jobTitle ?? c.job
	const meta = [request.company, formatDateTime(request.finishedAt ?? request.requestedAt)].filter(Boolean).join(' · ')

	// O cabeçalho todo abre e fecha o ajuste; os botões e links dentro dele fazem só a ação deles
	const toggleFromHeader = (event: MouseEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest('a, button')) return
		setExpanded(!expanded)
	}

	return (
		<li className={card({ size: 'sm', failed: request.status === 'failed', className: 'flex flex-col gap-3' })}>
			{/* Pelo teclado, quem abre e fecha é a seta (um botão de verdade) */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: atalho do mouse para a seta */}
			<div className="flex cursor-pointer items-start gap-3.5" onClick={toggleFromHeader}>
				{/* Pronto, a folha abre o PDF, como a do currículo base */}
				{ready ? (
					<a className={SHEET_LINK} href={cvPdfUrl(request.requestId)} {...NEW_TAB} aria-label={c.openPdfOf(title)}>
						<PdfIcon>PDF</PdfIcon>
					</a>
				) : (
					<PdfIcon dashed={request.status === 'pending'}>
						{request.status === 'pending' ? <Icon name="spinner" size={14} /> : c.error}
					</PdfIcon>
				)}

				<div className="flex min-w-0 grow flex-col gap-2">
					<div className="flex items-start gap-3">
						<div className="flex min-w-0 grow flex-col gap-1">
							{/* O cargo leva à vaga; o resto do cabeçalho abre o ajuste */}
							<Link
								className="block truncate font-semibold no-underline hover:underline hover:underline-offset-3"
								to="/jobs/$id"
								params={jobParams(request.postId)}
							>
								{title}
							</Link>
							<span className={META}>
								{request.status === 'pending' ? c.generating(formatDateTime(request.requestedAt)) : meta}
							</span>
							{request.status === 'failed' && <span className="text-sm text-danger">{request.error}</span>}
						</div>

						<div className="flex shrink-0 items-center gap-2">
							{ready && (
								<>
									<Button className="max-md:hidden" variant="ghost" href={cvPdfUrl(request.requestId)} external>
										{c.open}
									</Button>
									<Button
										className="max-md:hidden"
										variant={justReady ? 'lime' : 'ghost'}
										href={cvPdfUrl(request.requestId, true)}
										download={request.fileName ?? undefined}
									>
										<Icon name="download" size={14} />
										{c.download}
									</Button>
									{/* No celular, o baixar vira só o ícone e o abrir fica no ajuste */}
									<a
										className={iconButton({ size: 'sm', variant: 'ghost', className: 'md:hidden' })}
										href={cvPdfUrl(request.requestId, true)}
										download={request.fileName ?? undefined}
										aria-label={c.downloadPdfOf(title)}
										title={c.downloadTitle}
									>
										<Icon name="download" size={15} />
									</a>
								</>
							)}
							{request.status === 'failed' && (
								<Button variant="ghost" size="sm" onClick={() => retry(request)}>
									{c.retry}
								</Button>
							)}
							<IconButton
								size="sm"
								label={expanded ? c.hideDetails : c.showDetails}
								aria-expanded={expanded}
								aria-controls={detailsId}
								onClick={() => setExpanded(!expanded)}
							>
								<Icon name="chevron" size={16} className={cx('transition-transform duration-200', expanded && 'rotate-180')} />
							</IconButton>
						</div>
					</div>
					{(changes || outdated) && (
						<div className="flex flex-col gap-1.5">
							{changes && <ChangeSummary changes={changes} />}
							{outdated && (
								<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
									<span className="flex items-center gap-1.5">
										<Icon name="alert" size={13} />
										{c.outdated}
									</span>
									{latest && (
										<TextLink size="xs" onClick={() => retry(request)}>
											{c.generateAgain}
										</TextLink>
									)}
								</span>
							)}
						</div>
					)}
				</div>
			</div>

			{expanded && (
				<div id={detailsId} className="flex flex-col gap-3 animate-panel-in motion-reduce:animate-none">
					{changes && <Changes changes={changes} fresh={false} tone="quiet" />}
					<div className="flex flex-wrap gap-2">
						<ButtonLink variant="ghost" size="sm" to="/jobs/$id" params={jobParams(request.postId)}>
							<Icon name="briefcase" size={14} />
							{c.seeJob}
						</ButtonLink>
						{ready && (
							<Button className="md:hidden" variant="ghost" size="sm" href={cvPdfUrl(request.requestId)} external>
								{c.openPdf}
							</Button>
						)}
					</div>
				</div>
			)}
		</li>
	)
}

/** De onde veio a versão: o arquivo enviado, o formulário ou o editor do site. */
function versionName(version: WebCvBaseVersion) {
	if (version.fileName) return version.fileName
	return version.fromForm ? t().cvs.fromForm : t().cvs.editedOnSite
}

type CvBaseCardProps = {
	/** `null` se não deu para carregar. */
	versions: WebCvBaseVersion[] | null
	/** Os pedidos da lista, para contar os currículos que saíram da versão em uso. */
	requests: WebCvRequest[]
}

/** O currículo base em uso, com a primeira página, quantos currículos saíram dele e o caminho para trocá-lo. */
function CvBaseCard({ versions, requests }: CvBaseCardProps) {
	const c = useT().cvs
	const active = versions && activeVersion(versions)
	const validating = versions?.some(version => version.status === 'validating')
	const generated = versions
		? requests.filter(request => request.base && request.base.versionId === (active?.versionId ?? null)).length
		: 0

	const name = !versions ? c.notLoaded : active ? versionName(active) : 'cv.tex'
	const facts = !versions
		? [c.versionsFailed]
		: active
			? [c.inUseSince(formatDateTime(active.activatedAt!)), active.pages && c.pages(active.pages)].filter(Boolean)
			: [c.usingFile]

	return (
		<section
			className={card({ size: 'md', className: 'flex items-center gap-5 max-md:flex-col max-md:items-stretch max-md:gap-4' })}
			aria-labelledby="cv-base-title"
		>
			<div className="flex min-w-0 grow items-center gap-5 max-md:gap-4">
				{active?.status === 'valid' ? (
					<a className={SHEET_LINK} href={cvBasePdfUrl(active.versionId)} {...NEW_TAB} aria-label={c.openBasePdf}>
						<PdfIcon>PDF</PdfIcon>
					</a>
				) : (
					<PdfIcon>.tex</PdfIcon>
				)}

				<div className="flex min-w-0 grow flex-col gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className={LABEL}>{c.base}</span>
						{validating && (
							<Badge tone="running" size="sm">
								{c.validating}
							</Badge>
						)}
					</span>
					<h2 id="cv-base-title" className="truncate text-lg font-semibold">
						{name}
					</h2>
					<span className={META}>{facts.join(' · ')}</span>
					{versions && <span className="mt-1 text-sm">{generated === 0 ? c.noneGenerated : c.generated(generated)}</span>}
				</div>
			</div>

			<ButtonLink className="shrink-0" variant="ghost" to="/resumes/base">
				{c.change}
			</ButtonLink>
		</section>
	)
}

function CvList({
	requests,
	isOutdated,
	latest,
}: {
	requests: WebCvRequest[]
	isOutdated: (request: WebCvRequest) => boolean
	latest: Set<string>
}) {
	return (
		<ul className={cx(LIST, 'flex flex-col gap-2.5')}>
			{requests.map(request => (
				<CvItem key={request.requestId} request={request} outdated={isOutdated(request)} latest={latest.has(request.requestId)} />
			))}
		</ul>
	)
}

/** "Meus currículos": o currículo base e os PDFs gerados pelo site, para baixar de novo sem gerar outro. */
export function CvsView({ baseVersions }: { baseVersions: WebCvBaseVersion[] | null }) {
	const c = useT().cvs
	// A lista vem do loader da rota (`routes/resumes.tsx`), que também cuida do carregamento e do erro
	const { requests } = useCvRequests()
	const [query, setQuery] = useState('')

	// A busca filtra pelo cargo e pela empresa; os grupos e o "mais recente da vaga" seguem a lista inteira
	const terms = searchable(query.trim())
	const matches = (request: WebCvRequest) =>
		!terms || searchable(`${request.jobTitle ?? ''} ${request.company ?? ''}`).includes(terms)
	const shown = requests.filter(matches)

	const pending = shown.filter(request => request.status === 'pending')
	const done = shown.filter(request => request.status !== 'pending')

	// O pedido mais recente de cada vaga (a lista vem do mais novo ao mais antigo)
	const seen = new Set<string>()
	const latest = new Set<string>()
	for (const request of requests) {
		if (seen.has(request.postId)) continue
		seen.add(request.postId)
		latest.add(request.requestId)
	}

	// Sem as versões, não dá para saber qual é a ativa: nenhum aparece como desatualizado
	const activeId = baseVersions ? (activeVersion(baseVersions)?.versionId ?? null) : undefined
	const isOutdated = (request: WebCvRequest) =>
		activeId !== undefined && request.status === 'ready' && !!request.base && request.base.versionId !== activeId

	const now = new Date()
	const groups = DATE_GROUPS.map(group => ({
		group,
		items: done.filter(request => dateGroup(request.finishedAt ?? request.requestedAt, now) === group),
	})).filter(({ items }) => items.length > 0)

	return (
		<Page width="medium">
			<Hero
				title={
					<>
						{c.heroTitle} <Hero.Mono>{c.heroTitleMono}</Hero.Mono>
					</>
				}
				lead={c.heroLead}
			/>

			<CvBaseCard versions={baseVersions} requests={requests} />

			{requests.length === 0 && (
				<EmptyState
					illustration="cv"
					title={c.emptyTitle}
					description={c.emptyDescription}
					action={
						<ButtonLink variant="lime" to="/">
							{c.seeJobs}
						</ButtonLink>
					}
				/>
			)}

			{requests.length > 0 && (
				<SearchInput
					label={c.search}
					value={query}
					onChange={event => setQuery(event.target.value)}
					placeholder={c.searchPlaceholder}
				/>
			)}
			{requests.length > 0 && shown.length === 0 && (
				<EmptyState
					illustration="search"
					title={c.noMatchTitle}
					description={c.noMatchDescription}
					action={
						<Button variant="ghost" onClick={() => setQuery('')}>
							{c.clearSearch}
						</Button>
					}
				/>
			)}

			{pending.length > 0 && (
				<section className="flex flex-col gap-2.5">
					<h2 className={GROUP_TITLE}>{c.inProgress}</h2>
					<CvList requests={pending} isOutdated={isOutdated} latest={latest} />
				</section>
			)}
			{groups.map(({ group, items }) => (
				<section key={group} className="flex flex-col gap-2.5">
					<h2 className={GROUP_TITLE}>
						{c.dateGroups[group]} · {items.length}
					</h2>
					<CvList requests={items} isOutdated={isOutdated} latest={latest} />
				</section>
			))}
		</Page>
	)
}
