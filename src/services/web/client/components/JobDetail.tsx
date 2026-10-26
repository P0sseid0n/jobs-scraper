import { useNavigate } from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState } from 'react'

import { applicationMessage, formatApplicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, languageLabel, listingPageText, safeLink, timeAgo } from '../lib/format'
import { revealJobDetail } from '../lib/job-opening'
import { useCvFor, useGeneratedMessage } from '../stores/cv'
import { removeJob, replaceJob } from '../stores/jobs'
import { copyText, notify } from '../stores/toast'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CorrectedBadge } from './CorrectedBadge'
import { CvButton } from './CvButton'
import { CvReady } from './CvReady'
import { ExtractionChecksBadge, MissedChecks } from './ExtractionChecksBadge'
import { Icon } from './Icon'
import { ListingBadge } from './ListingBadge'
import { ReportJobDialog } from './ReportJobDialog'
import { badge, BadgeList } from './ui/Badge'
import { Button } from './ui/Button'
import { CodeBlock } from './ui/CodeBlock'
import { IconButton } from './ui/IconButton'
import { Notice } from './ui/Notice'
import { Skeleton } from './ui/Skeleton'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600

/** Os botões de candidatura dividem a linha e quebram quando não cabem. */
const DETAIL_ACTION = 'flex-1 basis-45'

const MESSAGE_BOX = 'flex flex-col gap-2.5 rounded-sm bg-surface-2 p-3.5'

/** No `bun dev` (com o recarregamento ao vivo): o JSON da vaga só aparece para quem está desenvolvendo. */
const DEVELOPMENT = Boolean(import.meta.hot)
const MESSAGE_TEXT = 'm-0 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word'

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

	// A mensagem gerada pela IA aparece no lugar do modelo padrão, que continua a um clique
	const [useDefaultMessage, setUseDefaultMessage] = useState(false)

	const cv = useCvFor(job.postId)
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)
	const appliesThroughPost = !applyLink && !job.recruiterEmail
	const generated = useGeneratedMessage(job.postId)
	const showGenerated = !!generated && !useDefaultMessage
	const message = generated && showGenerated ? formatApplicationMessage(generated) : applicationMessage(job.title)
	// Vaga de um post com várias: o texto é o da página aberta pelo link dela, não o do post
	const fromList = !!job.sourcePostId
	const content = fromList ? listingPageText(job.rawContent) : job.rawContent
	const contentNoun = fromList ? 'texto' : 'post'
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
				<CvButton job={job} size="lg" className={DETAIL_ACTION} />
				{applyLink && (
					<Button variant="ghost" size="lg" className={DETAIL_ACTION} href={applyLink} external>
						ir para a candidatura
					</Button>
				)}
				{/* Sem site nem e-mail, a candidatura é pelo próprio post: aí ele é um botão */}
				{postLink && appliesThroughPost && (
					<Button variant="ghost" size="lg" className={DETAIL_ACTION} href={postLink} external>
						ver post e se candidatar
					</Button>
				)}
			</div>

			{cv?.status === 'ready' && <CvReady key={cv.requestId} cv={cv} />}
			{cv?.status === 'failed' && (
				<Notice tone="danger" className="text-sm">
					O currículo falhou: {cv.error}
				</Notice>
			)}

			{job.recruiterEmail && (
				<section className="flex flex-col gap-2.5" aria-label="Contato">
					<h3 className={LABEL}>contato</h3>
					<div className="flex min-w-0 items-center gap-2 rounded-sm border border-line py-1.5 pr-1.5 pl-3 text-sm">
						<a className="font-mono block truncate grow no-underline" href={`mailto:${job.recruiterEmail}`}>
							{job.recruiterEmail}
						</a>
						<Button variant="ghost" onClick={() => copyText(job.recruiterEmail!, 'E-mail')}>
							<Icon name="copy" size={14} />
							copiar
						</Button>
					</div>
					<div className={MESSAGE_BOX}>
						<div className="flex items-center justify-between gap-3">
							<span className={LABEL}>{showGenerated ? 'mensagem gerada pela IA' : 'modelo de mensagem'}</span>
							<Button variant="ghost" size="xs" onClick={() => copyText(message, 'Mensagem')}>
								<Icon name="copy" size={13} />
								copiar
							</Button>
						</div>
						<pre className={MESSAGE_TEXT}>{message}</pre>
						{generated ? (
							<div className="flex items-center justify-between gap-3 text-muted text-xs">
								<span>{showGenerated ? 'revise antes de enviar' : ''}</span>
								<TextLink className="text-xs" onClick={() => setUseDefaultMessage(!useDefaultMessage)}>
									{showGenerated ? 'usar o modelo padrão' : 'usar a mensagem da IA'}
								</TextLink>
							</div>
						) : (
							<p className="text-muted text-xs">
								{cv?.status === 'pending'
									? 'A mensagem escrita para esta vaga chega junto com o currículo.'
									: 'Gere o currículo para receber uma mensagem escrita para esta vaga.'}
							</p>
						)}
					</div>
				</section>
			)}

			<section className="flex flex-col gap-2.5" aria-label={fromList ? 'Página da vaga' : 'Post original'}>
				<div className="flex items-center justify-between gap-3">
					<h3 className={LABEL}>{fromList ? 'página da vaga' : 'post original'}</h3>
					{/* Com outra forma de candidatura, o post serve mais para conferir (debug): link discreto */}
					{postLink && !appliesThroughPost && (
						<TextLink className="text-xs font-mono" href={postLink} external>
							{fromList ? 'ver post com a lista' : 'ir para o post'}
						</TextLink>
					)}
				</div>
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
					<CodeBlock label="documento no mongodb" onCopy={() => copyText(rawJson, 'JSON da vaga')} scroll>
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
