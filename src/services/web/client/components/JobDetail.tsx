import { useNavigate } from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState } from 'react'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import {
	formatDateTime,
	isListingPageText,
	jobDate,
	jobSubtitle,
	languageLabel,
	listingPageText,
	safeLink,
	timeAgo,
} from '../lib/format'
import { revealJobDetail } from '../lib/job-opening'
import { jobParams } from '../router'
import { appliedSuggestion, setApplied, useAppliedAt, useAppliedSimilar } from '../stores/applied'
import { useCvFor } from '../stores/cv'
import { removeJob, replaceJob } from '../stores/jobs'
import { notify } from '../stores/toast'
import { JobContact, JobMailStatus } from './ContactDialog'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CopyButton } from './CopyButton'
import { CorrectedBadge } from './CorrectedBadge'
import { CvButton } from './CvButton'
import { CvReady } from './CvReady'
import { ExtractionChecksBadge, MissedChecks } from './ExtractionChecksBadge'
import { Icon } from './Icon'
import { JobReposts } from './JobReposts'
import { ListingBadge } from './ListingBadge'
import { PostImages } from './PostImages'
import { ReportJobDialog } from './ReportJobDialog'
import { badge, BadgeList } from './ui/Badge'
import { Button } from './ui/Button'
import { CodeBlock } from './ui/CodeBlock'
import { IconButton } from './ui/IconButton'
import { Notice } from './ui/Notice'
import { Skeleton } from './ui/Skeleton'
import { LABEL } from './ui/text'
import { RouteLink, TextLink } from './ui/TextLink'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600

/** Os botões de candidatura dividem a linha e quebram quando não cabem. */
const DETAIL_ACTION = 'flex-1 basis-45'

/** No `bun dev` (com o recarregamento ao vivo): o JSON da vaga só aparece para quem está desenvolvendo. */
const DEVELOPMENT = Boolean(import.meta.hot)

/** Todos os dados da vaga, com as ações de candidatura (painel lateral no desktop, página própria no celular). */
export function JobDetail({ job }: { job: WebJob }) {
	// A vaga corrigida aqui vale mesmo que quem passou `job` (a lista, ou a vaga buscada pelo link) não a tenha
	const [corrected, setCorrected] = useState<WebJob | null>(null)
	const current = corrected?.postId === job.postId ? corrected : job

	// Outra vaga começa do zero: post recolhido, sem o JSON da anterior e com a mensagem da IA
	return <JobDetailContent key={job.postId} job={current} onCorrected={setCorrected} />
}

function JobDetailContent({ job, onCorrected }: { job: WebJob; onCorrected: (job: WebJob) => void }) {
	const navigate = useNavigate()
	const root = useRef<HTMLDivElement>(null)
	const [expanded, setExpanded] = useState(false)
	const [reporting, setReporting] = useState(false)

	// Depuração: o documento da vaga no MongoDB, buscado só quando pedido
	const [rawJson, setRawJson] = useState<string | null>(null)
	const [loadingRaw, setLoadingRaw] = useState(false)

	const cv = useCvFor(job.postId)
	const appliedAt = useAppliedAt(job)
	const appliedSimilar = useAppliedSimilar(job.postId)
	// Copiar a mensagem ou abrir a candidatura não quer dizer que enviou: o aviso só lembra de marcar
	const suggestion = appliedSuggestion({ postId: job.postId, appliedAt })
	const remindToMark = () => {
		if (suggestion) notify('Depois de enviar a candidatura, marque aqui', 'info', suggestion)
	}
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)
	const appliesThroughPost = !applyLink && !job.recruiterEmail
	// Vaga de um post com várias: o texto é o da página aberta pelo link dela, não o do post
	const fromList = !!job.sourcePostId
	const fromPage = fromList && isListingPageText(job.rawContent)
	const content = fromPage ? listingPageText(job.rawContent) : job.rawContent
	const contentNoun = fromPage ? 'texto' : 'post'
	const isLong = content.length > LONG_POST_CHARS

	// Aberta pelo card da lista, os blocos entram um depois do outro (a chave remonta este componente a cada vaga)
	useLayoutEffect(() => {
		if (root.current) revealJobDetail(root.current)
	}, [])

	async function toggleRawJson() {
		if (rawJson !== null) {
			setRawJson(null)
			return
		}

		setLoadingRaw(true)
		try {
			setRawJson(JSON.stringify(await api.rawJob(job.postId), null, 2))
		} catch (error) {
			notify(error instanceof RequestError ? error.message : 'Não consegui carregar o JSON da vaga', 'error')
		} finally {
			setLoadingRaw(false)
		}
	}

	return (
		<div ref={root} className="flex flex-col gap-5.5">
			<header className="flex flex-col gap-2.5">
				<div className="flex items-center justify-between gap-3">
					<div className="flex flex-wrap items-center gap-1.5">
						<WorkModeBadge job={job} />
						<ContractTypeBadge job={job} />
						<CorrectedBadge job={job} />
						<ListingBadge job={job} />
						<ExtractionChecksBadge job={job} />
					</div>
					<div className="flex items-center">
						<time className="font-mono text-muted text-sm whitespace-nowrap" dateTime={jobDate(job)}>
							publicada {timeAgo(jobDate(job))}
						</time>
						<IconButton
							label="reportar problema na vaga"
							size="sm"
							bordered
							// Na cor do texto, para não sumir ao lado da data
							className="ml-3 text-ink"
							aria-haspopup="dialog"
							onClick={() => setReporting(true)}
						>
							<Icon name="flag" size={15} />
						</IconButton>
					</div>
				</div>
				<h2 className="text-2xl leading-tight font-bold">{job.title}</h2>
				{jobSubtitle(job) && <p className="text-muted">{jobSubtitle(job)}</p>}
				{job.author && (job.company || job.location) && <p className="font-mono text-muted text-xs">postado por {job.author}</p>}
			</header>
			{reporting && (
				<ReportJobDialog
					job={job}
					onClose={() => setReporting(false)}
					onCorrected={saved => {
						onCorrected(saved)
						replaceJob(saved)
						// O JSON aberto mostraria o documento de antes da correção
						setRawJson(null)
					}}
					onRemoved={() => {
						removeJob(job.postId)
						void navigate({ to: '/', replace: true })
					}}
				/>
			)}

			{job.necessaryKnowledge && (
				<BadgeList aria-label="Tecnologias">
					{job.necessaryKnowledge.map(skill => (
						<li className={badge()} key={skill}>
							{skill}
						</li>
					))}
				</BadgeList>
			)}

			<div className="flex flex-wrap gap-2">
				{/* Com e-mail, o contato é a candidatura: o currículo é gerado na modal, para ir anexado */}
				{job.recruiterEmail ? (
					<JobContact job={{ ...job, recruiterEmail: job.recruiterEmail }} copyAction={suggestion} className={DETAIL_ACTION} />
				) : (
					<CvButton job={job} size="lg" className={DETAIL_ACTION} />
				)}
				{applyLink && (
					<Button variant="ghost" size="lg" className={DETAIL_ACTION} href={applyLink} external onClick={remindToMark}>
						ir para a candidatura
					</Button>
				)}
				{/* Sem site nem e-mail, a candidatura é pelo próprio post: aí ele é um botão */}
				{postLink && appliesThroughPost && (
					<Button variant="ghost" size="lg" className={DETAIL_ACTION} href={postLink} external onClick={remindToMark}>
						ver post e se candidatar
					</Button>
				)}
			</div>

			{/* O último envio pela modal do contato: enviando, enviada ou o motivo da falha */}
			<JobMailStatus postId={job.postId} />

			{/* Marcada, a vaga sai da lista (o filtro "esconder candidaturas enviadas") e o selo fica no card */}
			{appliedAt ? (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" role="status">
					<span className={badge({ tone: 'running' })}>
						<Icon name="check" size={13} />
						candidatura enviada {formatDateTime(appliedAt)}
					</span>
					<TextLink className="text-xs font-mono" onClick={() => void setApplied(job, false)}>
						desmarcar
					</TextLink>
				</div>
			) : (
				<Button variant="ghost" size="sm" className="self-start" onClick={() => void setApplied(job, true)}>
					<Icon name="check" size={13} />
					já enviei a candidatura
				</Button>
			)}

			{/* A mesma vaga postada de novo, sem ter sido agrupada (outro texto, outro recrutador): avisa antes de enviar outra vez */}
			{appliedSimilar && !appliedAt && (
				<Notice tone="warn" icon="alert" className="text-sm">
					<p className="m-0">
						Você já enviou candidatura para uma vaga parecida em {formatDateTime(appliedSimilar.appliedAt)}:{' '}
						<RouteLink className="text-sm" to="/vagas/$id" params={jobParams(appliedSimilar.postId)}>
							{appliedSimilar.title}
							{appliedSimilar.company && ` · ${appliedSimilar.company}`}
						</RouteLink>
						. Confira se não é a mesma antes de enviar de novo.
					</p>
				</Notice>
			)}

			{cv?.status === 'ready' && <CvReady key={cv.requestId} cv={cv} />}
			{cv?.status === 'failed' && (
				<Notice tone="danger" className="text-sm">
					O currículo falhou: {cv.error}
				</Notice>
			)}

			<section className="flex flex-col gap-2.5" aria-label={fromPage ? 'Página da vaga' : 'Post original'}>
				<div className="flex items-center justify-between gap-3">
					<h3 className={LABEL}>{fromPage ? 'página da vaga' : 'post original'}</h3>
					{/* Sempre aparece, mesmo repetindo o botão de candidatura pelo post: é o lugar onde se procura o post */}
					{postLink && (
						<TextLink className="text-xs font-mono" href={postLink} external>
							{fromList ? 'ver post com a lista' : 'ir para o post'}
						</TextLink>
					)}
				</div>
				{/* Muitos posts põem a vaga numa arte e deixam o texto curto: as imagens vêm antes dele */}
				<PostImages job={job} />
				<div
					className={cx(
						'text-sm leading-relaxed whitespace-pre-line wrap-anywhere',
						isLong && !expanded && 'max-h-34 overflow-hidden mask-b-from-60%',
					)}
				>
					{content}
				</div>
				{isLong && (
					<TextLink className="text-sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
						{expanded ? `recolher ${contentNoun}` : `mostrar ${contentNoun} completo`}
					</TextLink>
				)}
			</section>

			<JobReposts
				job={job}
				onUngrouped={saved => {
					onCorrected(saved)
					replaceJob(saved)
					setRawJson(null)
				}}
			/>

			<footer className="flex flex-col gap-2 border-t border-line pt-3.5">
				{/* Só a partir do limite das configurações: com poucos checks, o selo do topo já basta */}
				{job.needsReview && (
					<Notice tone="danger" icon="alert" className="text-sm">
						<p>
							Confira <MissedChecks job={job} /> no post original: a extração pode ter errado{' '}
							{job.extractionChecks.length === 1 ? 'nesse campo' : 'nesses campos'} e no resto da vaga. Se houver erro,{' '}
							<TextLink className="text-sm" aria-haspopup="dialog" onClick={() => setReporting(true)}>
								reporte a vaga
							</TextLink>
							.
						</p>
					</Notice>
				)}
				{job.language && <span className="font-mono text-muted text-xs">idioma: {languageLabel(job.language)}</span>}
				{DEVELOPMENT && (
					<TextLink className="text-xs font-mono" aria-expanded={rawJson !== null} disabled={loadingRaw} onClick={toggleRawJson}>
						{loadingRaw ? 'carregando json…' : rawJson !== null ? 'esconder json da vaga' : 'ver json da vaga (debug)'}
					</TextLink>
				)}
				{rawJson !== null && (
					<CodeBlock label="documento no mongodb" action={<CopyButton text={rawJson} what="JSON da vaga" size="xs" />} scroll>
						{rawJson}
					</CodeBlock>
				)}
			</footer>
		</div>
	)
}

/** O detalhe carregando, no formato do `JobDetail`: selos e data, cargo, empresa, tecnologias, botões e o post. */
export function JobDetailSkeleton() {
	return (
		<div className="flex flex-col gap-5.5" aria-busy="true">
			<div className="flex flex-col gap-2.5">
				<div className="flex items-center justify-between gap-3">
					<div className="flex gap-1.5">
						<Skeleton className="h-6 w-18 rounded-pill bg-surface-2" />
						<Skeleton className="h-6 w-12 rounded-pill bg-surface-2" />
					</div>
					<Skeleton className="h-4 w-28 rounded-xs bg-surface-2" />
				</div>
				<Skeleton className="h-7 w-4/5 rounded-xs bg-surface-2" />
				<Skeleton className="h-4 w-1/2 rounded-xs bg-surface-2" />
			</div>
			<div className="flex flex-wrap gap-1.5">
				{['w-16', 'w-20', 'w-12', 'w-18', 'w-14'].map(width => (
					<Skeleton key={width} className={cx('h-6 rounded-pill bg-surface-2', width)} />
				))}
			</div>
			<div className="flex flex-wrap gap-2">
				<Skeleton className={cx('h-11.5 rounded-pill bg-surface-2', DETAIL_ACTION)} />
				<Skeleton className={cx('h-11.5 rounded-pill bg-surface-2', DETAIL_ACTION)} />
			</div>
			<div className="flex flex-col gap-2.5">
				<Skeleton className="h-3 w-24 rounded-xs bg-surface-2" />
				{['w-full', 'w-11/12', 'w-full', 'w-5/6', 'w-2/3'].map((width, index) => (
					<Skeleton key={index} className={cx('h-3.5 rounded-xs bg-surface-2', width)} />
				))}
			</div>
		</div>
	)
}
