import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'

import type { CvChanges } from '@shared/contracts'
import { formatApplicationMessage } from '@shared/templates'

import type { WebCvBaseVersion, WebCvRequest } from '../../api-types'
import { cvBasePdfUrl, cvPdfUrl } from '../api'
import { Changes } from '../components/CvReady'
import { Icon } from '../components/Icon'
import { PdfThumbnail } from '../components/PdfThumbnail'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { iconButton, IconButton } from '../components/ui/IconButton'
import { NEW_TAB } from '../components/ui/link'
import { Hero, Page } from '../components/ui/Page'
import { LABEL } from '../components/ui/text'
import { TextLink } from '../components/ui/TextLink'
import { activeVersion } from '../lib/cv-base'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { jobParams } from '../router'
import { requestCv, useCvRequests } from '../stores/cv'
import { copyText, notify } from '../stores/toast'

/** Quantas tecnologias que entraram (e que saíram) aparecem no resumo do item; o resto vira "+N". */
const SUMMARY_ADDED = 4
const SUMMARY_REMOVED = 2

/** A folha clicável que abre o PDF: sobe um pouco no hover, como os botões. */
const SHEET_LINK =
	'shrink-0 rounded-xs no-underline transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime'

const DAY_MS = 24 * 60 * 60 * 1000

/** Os grupos da lista de gerados, na ordem em que aparecem. */
const DATE_GROUPS = ['hoje', 'ontem', 'nos últimos 7 dias', 'nos últimos 30 dias', 'há mais tempo'] as const
type DateGroup = (typeof DATE_GROUPS)[number]

function dateGroup(iso: string, now: Date): DateGroup {
	const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
	const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS)

	if (days <= 0) return 'hoje'
	if (days === 1) return 'ontem'
	if (days < 7) return 'nos últimos 7 dias'
	if (days < 30) return 'nos últimos 30 dias'
	return 'há mais tempo'
}

async function retry(request: WebCvRequest) {
	try {
		await requestCv(request)
	} catch (error) {
		notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
	}
}

function hasChanges(changes: CvChanges | null): changes is CvChanges {
	return (
		!!changes &&
		(changes.addedSkills.length > 0 || changes.removedSkills.length > 0 || !!changes.summary || changes.projects.length > 0)
	)
}

/** "+React +Docker −PHP · 3 projetos · apresentação reescrita": o ajuste numa linha, sem abrir o PDF. */
function ChangeSummary({ changes }: { changes: CvChanges }) {
	const added = changes.addedSkills.slice(0, SUMMARY_ADDED)
	const removed = changes.removedSkills.slice(0, SUMMARY_REMOVED)
	const hidden = changes.addedSkills.length - added.length + changes.removedSkills.length - removed.length
	const facts = [
		changes.projects.length > 0 && `${changes.projects.length} ${changes.projects.length === 1 ? 'projeto' : 'projetos'}`,
		changes.summary && 'apresentação reescrita',
	].filter(Boolean)

	return (
		<span className="flex flex-wrap items-center gap-1.5">
			{added.map(skill => (
				<Badge key={`+${skill}`} tone="running" size="sm">
					<span className="sr-only">entrou:</span>
					<span className="max-w-48 truncate">+{skill}</span>
				</Badge>
			))}
			{removed.map(skill => (
				<Badge key={`-${skill}`} tone="plain" size="sm" bordered className="text-muted">
					<span className="sr-only">saiu:</span>
					<span className="strike-through max-w-48 truncate">{skill}</span>
				</Badge>
			))}
			{hidden > 0 && <span className="font-mono text-xs text-muted">e mais {hidden}</span>}
			{facts.length > 0 && (
				<span className="font-mono text-xs text-muted">
					{added.length + removed.length > 0 && '· '}
					{facts.join(' · ')}
				</span>
			)}
		</span>
	)
}

/** O e-mail de candidatura que a IA escreveu para a vaga, para copiar. */
function ApplicationMessageBox({ message }: { message: NonNullable<WebCvRequest['message']> }) {
	const text = formatApplicationMessage(message)

	return (
		<section className="flex flex-col gap-2.5 rounded-sm bg-surface-2 p-3.5" aria-label="E-mail de candidatura">
			<div className="flex items-center justify-between gap-3">
				<span className={LABEL}>e-mail de candidatura</span>
				<Button variant="ghost" size="xs" onClick={() => copyText(text, 'Mensagem')}>
					<Icon name="copy" size={13} />
					copiar
				</Button>
			</div>
			<pre className="m-0 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word">{text}</pre>
		</section>
	)
}

type CvItemProps = {
	request: WebCvRequest
	/** Saiu de outra versão do currículo base que não a ativa. */
	outdated: boolean
	/** É o pedido mais recente da vaga: só ele oferece gerar de novo. */
	latest: boolean
}

function CvItem({ request, outdated, latest }: CvItemProps) {
	const [expanded, setExpanded] = useState(false)
	const detailsId = useId()

	const ready = request.status === 'ready'
	const changes = hasChanges(request.changes) ? request.changes : null
	const expandable = ready && (!!changes || !!request.message)
	const title = request.jobTitle ?? 'Vaga'
	const meta = [request.company, formatDateTime(request.finishedAt ?? request.requestedAt)].filter(Boolean).join(' · ')

	return (
		<li className={card({ size: 'sm', failed: request.status === 'failed', className: 'flex flex-col gap-3' })}>
			<div className="flex items-start gap-3.5">
				{ready ? (
					<a className={SHEET_LINK} href={cvPdfUrl(request.requestId)} {...NEW_TAB} aria-label={`Abrir o PDF de ${title}`}>
						<PdfThumbnail url={cvPdfUrl(request.requestId)}>PDF</PdfThumbnail>
					</a>
				) : (
					<PdfThumbnail dashed={request.status === 'pending'}>
						{request.status === 'pending' ? <Icon name="spinner" size={14} /> : 'erro'}
					</PdfThumbnail>
				)}

				<div className="flex min-w-0 grow flex-col gap-2">
					<div className="flex items-start gap-3">
						<div className="flex min-w-0 grow flex-col gap-1">
							<Link
								className="block truncate font-semibold no-underline hover:underline"
								to="/vagas/$id"
								params={jobParams(request.postId)}
							>
								{title}
							</Link>
							<span className="font-mono text-xs text-muted">
								{request.status === 'pending' ? `gerando · pedido ${formatDateTime(request.requestedAt)}` : meta}
							</span>
							{request.status === 'failed' && <span className="text-sm text-danger">{request.error}</span>}
						</div>

						{ready && (
							<div className="flex shrink-0 items-center gap-2">
								<Button className="max-md:hidden" variant="ghost" href={cvPdfUrl(request.requestId)} external>
									abrir
								</Button>
								<Button
									className="max-md:hidden"
									variant="lime"
									href={cvPdfUrl(request.requestId, true)}
									download={request.fileName ?? undefined}
								>
									<Icon name="download" size={14} />
									baixar
								</Button>
								{/* No celular, a folha abre o PDF e o baixar vira só o ícone */}
								<a
									className={iconButton({ size: 'sm', bordered: true, className: 'md:hidden' })}
									href={cvPdfUrl(request.requestId, true)}
									download={request.fileName ?? undefined}
									aria-label={`Baixar o PDF de ${title}`}
									title="Baixar"
								>
									<Icon name="download" size={15} />
								</a>
								{expandable && (
									<IconButton
										size="sm"
										label={expanded ? 'Esconder o ajuste' : 'Ver o ajuste e o e-mail'}
										aria-expanded={expanded}
										aria-controls={detailsId}
										onClick={() => setExpanded(!expanded)}
									>
										<Icon
											name="chevron"
											size={16}
											className={cx('transition-transform duration-200', expanded && 'rotate-180')}
										/>
									</IconButton>
								)}
							</div>
						)}
						{request.status === 'failed' && (
							<Button className="shrink-0" variant="ghost" size="sm" onClick={() => retry(request)}>
								tentar de novo
							</Button>
						)}
					</div>
					{(changes || outdated) && (
						<div className="flex flex-col gap-1.5">
							{changes && (
								<button
									type="button"
									className="cursor-pointer border-0 bg-transparent p-0 text-left"
									aria-expanded={expanded}
									aria-controls={detailsId}
									onClick={() => setExpanded(!expanded)}
								>
									<ChangeSummary changes={changes} />
								</button>
							)}
							{outdated && (
								<span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
									<span className="flex items-center gap-1.5">
										<Icon name="alert" size={13} />
										feito com outra versão do currículo base
									</span>
									{latest && (
										<TextLink className="text-xs" onClick={() => retry(request)}>
											gerar de novo
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
					{changes && <Changes changes={changes} fresh={false} />}
					{request.message && <ApplicationMessageBox message={request.message} />}
				</div>
			)}
		</li>
	)
}

/** De onde veio a versão: o arquivo enviado, o formulário ou o editor do site. */
function versionName(version: WebCvBaseVersion) {
	if (version.fileName) return version.fileName
	return version.fromForm ? 'feito no formulário' : 'editado no site'
}

type CvBaseCardProps = {
	/** `null` se não deu para carregar. */
	versions: WebCvBaseVersion[] | null
	/** Os pedidos da lista, para contar os currículos que saíram da versão em uso. */
	requests: WebCvRequest[]
}

/** O currículo base em uso, com a primeira página, quantos currículos saíram dele e o caminho para trocá-lo. */
function CvBaseCard({ versions, requests }: CvBaseCardProps) {
	const active = versions && activeVersion(versions)
	const validating = versions?.some(version => version.status === 'validating')
	const generated = versions
		? requests.filter(request => request.base && request.base.versionId === (active?.versionId ?? null)).length
		: 0

	const name = !versions ? 'não carregou' : active ? versionName(active) : 'cv.tex'
	const facts = !versions
		? ['Não consegui carregar as versões do currículo base.']
		: active
			? [
					`em uso desde ${formatDateTime(active.activatedAt!)}`,
					active.pages && `${active.pages} ${active.pages === 1 ? 'página' : 'páginas'}`,
				].filter(Boolean)
			: ['usando o arquivo data/cv/cv.tex']

	return (
		<section
			className={card({ size: 'md', className: 'flex items-center gap-5 max-md:flex-col max-md:items-stretch max-md:gap-4' })}
			aria-labelledby="cv-base-title"
		>
			<div className="flex min-w-0 grow items-center gap-5 max-md:gap-4">
				{active?.status === 'valid' ? (
					<a className={SHEET_LINK} href={cvBasePdfUrl(active.versionId)} {...NEW_TAB} aria-label="Abrir o PDF do currículo base">
						<PdfThumbnail url={cvBasePdfUrl(active.versionId)} size="lg">
							PDF
						</PdfThumbnail>
					</a>
				) : (
					<PdfThumbnail size="lg">.tex</PdfThumbnail>
				)}

				<div className="flex min-w-0 grow flex-col gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className={LABEL}>currículo base</span>
						{validating && (
							<Badge tone="running" size="sm">
								validando
							</Badge>
						)}
					</span>
					<h2 id="cv-base-title" className="truncate text-lg font-semibold">
						{name}
					</h2>
					<span className="font-mono text-xs text-muted">{facts.join(' · ')}</span>
					{versions && (
						<span className="mt-1 text-sm">
							{generated === 0
								? 'Nenhum currículo gerado com ele ainda.'
								: `${generated} ${generated === 1 ? 'currículo gerado' : 'currículos gerados'} com ele.`}
						</span>
					)}
				</div>
			</div>

			<ButtonLink className="shrink-0" variant="ghost" to="/curriculos/base">
				alterar
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
		<ul className="m-0 flex list-none flex-col gap-2.5 p-0">
			{requests.map(request => (
				<CvItem key={request.requestId} request={request} outdated={isOutdated(request)} latest={latest.has(request.requestId)} />
			))}
		</ul>
	)
}

/** "Meus currículos": o currículo base e os PDFs gerados pelo site, para baixar de novo sem gerar outro. */
export function CvsView({ baseVersions }: { baseVersions: WebCvBaseVersion[] | null }) {
	// A lista vem do loader da rota (`routes/curriculos.tsx`), que também cuida do carregamento e do erro
	const { requests } = useCvRequests()

	const pending = requests.filter(request => request.status === 'pending')
	const done = requests.filter(request => request.status !== 'pending')

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
						meus <Hero.Mono>currículos.</Hero.Mono>
					</>
				}
				lead="Um PDF de uma página por vaga. Apresentação, habilidades, projetos e experiência se ajustam ao que ela pede."
			/>

			<CvBaseCard versions={baseVersions} requests={requests} />

			{requests.length === 0 && (
				<EmptyState
					illustration="cv"
					title="Nenhum currículo gerado pelo site ainda"
					description="Em qualquer vaga, clique em “gerar currículo”. Ele fica pronto em até ~1 minuto."
					action={
						<ButtonLink variant="lime" to="/">
							ver vagas
						</ButtonLink>
					}
				/>
			)}

			{pending.length > 0 && (
				<section className="flex flex-col gap-2.5">
					<h2 className={LABEL}>em andamento</h2>
					<CvList requests={pending} isOutdated={isOutdated} latest={latest} />
				</section>
			)}
			{groups.map(({ group, items }) => (
				<section key={group} className="flex flex-col gap-2.5">
					<h2 className={LABEL}>
						{group} · {items.length}
					</h2>
					<CvList requests={items} isOutdated={isOutdated} latest={latest} />
				</section>
			))}
		</Page>
	)
}
