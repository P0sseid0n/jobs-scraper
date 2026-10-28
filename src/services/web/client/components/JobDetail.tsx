import { useNavigate } from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState } from 'react'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type MessageLength, type MessageTone } from '@shared/contracts'
import { defaultApplicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { api, RequestError } from '../api'
import { cx } from '../lib/cx'
import {
	isListingPageText,
	jobDate,
	jobSubtitle,
	languageLabel,
	listingPageText,
	MESSAGE_LENGTH_LABELS,
	MESSAGE_TONE_LABELS,
	safeLink,
	timeAgo,
} from '../lib/format'
import { revealJobDetail } from '../lib/job-opening'
import { rewriteMessage, undoMessageRewrite, useCvFor, useGeneratedMessage } from '../stores/cv'
import { removeJob, replaceJob } from '../stores/jobs'
import { copyText, notify } from '../stores/toast'
import { ApplicationEmail, TOUCH_BUTTON } from './ApplicationEmail'
import { ContractTypeBadge } from './ContractTypeBadge'
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
import { Pill, PillGroup } from './ui/Pill'
import { Skeleton } from './ui/Skeleton'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600

/** Os botões de candidatura dividem a linha e quebram quando não cabem. */
const DETAIL_ACTION = 'flex-1 basis-45'

/** Uma das opções de reescrita da mensagem (tom, tamanho): o rótulo e as pills na mesma linha; no celular, um embaixo do outro. */
const MESSAGE_OPTION = 'flex items-center gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5'

/** Na tela de toque, a área de clique dos links do rodapé da mensagem chega aos 44px de altura. */
const TOUCH_LINK = 'relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2'

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

	// A mensagem gerada pela IA aparece no lugar do modelo padrão, que continua a um clique
	const [useDefaultMessage, setUseDefaultMessage] = useState(false)
	// O que está sendo reescrito pela IA agora (o tom, o tamanho, "mais direta" ou o desfazer), para o spinner
	const [rewriting, setRewriting] = useState<MessageTone | MessageLength | 'direct' | 'undo' | null>(null)

	const cv = useCvFor(job.postId)
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)
	const appliesThroughPost = !applyLink && !job.recruiterEmail
	const generatedRequest = useGeneratedMessage(job.postId)
	const generated = generatedRequest?.message ?? null
	const showGenerated = !!generated && !useDefaultMessage
	const message = generated && showGenerated ? generated : defaultApplicationMessage(job.title)
	// Mensagens de antes do tom e do tamanho foram escritas no neutro e no tamanho médio
	const tone = generated?.tone ?? 'neutral'
	const length = generated?.length ?? 'medium'
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

	/** Pede à IA outra versão da mensagem (ou desfaz a última); se ela não conseguir, a mensagem continua a mesma. */
	async function changeMessage(
		kind: NonNullable<typeof rewriting>,
		style: { tone: MessageTone; length: MessageLength; direct?: boolean } | null,
	) {
		if (!generatedRequest || rewriting) return

		setRewriting(kind)
		try {
			if (style) await rewriteMessage(generatedRequest.requestId, style)
			else await undoMessageRewrite(generatedRequest.requestId)
		} catch (error) {
			notify(error instanceof RequestError ? error.message : 'Não consegui reescrever a mensagem', 'error')
		} finally {
			setRewriting(null)
		}
	}

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

			{/* Depois do post: primeiro se lê a vaga, depois se escreve para o recrutador */}
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
					<ApplicationEmail
						label={showGenerated ? 'mensagem gerada pela IA' : 'modelo de mensagem'}
						aria-label="Mensagem de candidatura"
						message={message}
						busy={!!rewriting}
					>
						{showGenerated && (
							// Reescreve a mensagem já gerada: o tom e o tamanho escolhidos ficam ligados
							<div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-line-strong pt-3">
								<div className={MESSAGE_OPTION}>
									<span className={LABEL} aria-hidden="true">
										tom
									</span>
									<PillGroup role="group" aria-label="Tom da mensagem">
										{MESSAGE_TONES.map(option => (
											<Pill
												key={option}
												className={TOUCH_BUTTON}
												pressed={option === tone}
												disabled={!!rewriting}
												onClick={() => option !== tone && changeMessage(option, { tone: option, length })}
											>
												{rewriting === option && <Icon name="spinner" size={13} />}
												{MESSAGE_TONE_LABELS[option]}
											</Pill>
										))}
									</PillGroup>
								</div>
								<div className={MESSAGE_OPTION}>
									<span className={LABEL} aria-hidden="true">
										tamanho
									</span>
									<PillGroup role="group" aria-label="Tamanho da mensagem">
										{MESSAGE_LENGTHS.map(option => (
											<Pill
												key={option}
												className={TOUCH_BUTTON}
												pressed={option === length}
												disabled={!!rewriting}
												onClick={() => option !== length && changeMessage(option, { tone, length: option })}
											>
												{rewriting === option && <Icon name="spinner" size={13} />}
												{MESSAGE_LENGTH_LABELS[option]}
											</Pill>
										))}
									</PillGroup>
								</div>
								{/* Uma ação, não uma opção: cada clique reescreve de novo, mais enxuta */}
								<Button
									variant="ghost"
									size="sm"
									className={cx('sm:ml-auto', TOUCH_BUTTON)}
									disabled={!!rewriting}
									onClick={() => changeMessage('direct', { tone, length, direct: true })}
								>
									<Icon name={rewriting === 'direct' ? 'spinner' : 'refresh'} size={13} />
									deixar mais direta
								</Button>
							</div>
						)}
						{generated ? (
							<div className="flex items-center justify-between gap-3 text-muted text-xs">
								<span role="status">
									{rewriting && rewriting !== 'undo' ? (
										'a IA está reescrevendo…'
									) : showGenerated ? (
										<>
											revise antes de enviar
											{generatedRequest?.previousMessage && (
												<>
													{' · '}
													<TextLink
														className={cx('text-xs', TOUCH_LINK)}
														disabled={!!rewriting}
														onClick={() => changeMessage('undo', null)}
													>
														desfazer
													</TextLink>
												</>
											)}
										</>
									) : (
										''
									)}
								</span>
								<TextLink className={cx('text-xs', TOUCH_LINK)} onClick={() => setUseDefaultMessage(!useDefaultMessage)}>
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
					</ApplicationEmail>
				</section>
			)}

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
