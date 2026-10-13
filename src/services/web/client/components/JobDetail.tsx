import { useState } from 'react'

import { applicationMessage, formatApplicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { api, cvPdfUrl, RequestError } from '../api'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, languageLabel, safeLink, timeAgo } from '../lib/format'
import { useCvFor, useGeneratedMessage } from '../stores/cv'
import { copyText, notify } from '../stores/toast'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { ReportJobDialog } from './ReportJobDialog'
import { badge, BadgeList } from './ui/Badge'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Notice } from './ui/Notice'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600
const LOW_CONFIDENCE = 75

/** Todos os dados da vaga, com as ações de candidatura (painel lateral no desktop, página própria no celular). */
export function JobDetail({ job }: { job: WebJob }) {
	// Outra vaga começa do zero: post recolhido, sem o JSON da anterior e com a mensagem da IA
	return <JobDetailContent key={job.postId} job={job} />
}

function JobDetailContent({ job }: { job: WebJob }) {
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
	const isLong = job.rawContent.length > LONG_POST_CHARS

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
		<div className="job-detail">
			<header className="stack-sm">
				<div className="row-between">
					<div className="job-badges">
						<WorkModeBadge job={job} />
						<ContractTypeBadge job={job} />
					</div>
					<div className="row">
						<time className="mono muted text-sm nowrap" dateTime={jobDate(job)}>
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
				<h2 className="detail-title text-2xl leading-tight">{job.title}</h2>
				{jobSubtitle(job) && <p className="muted">{jobSubtitle(job)}</p>}
				{job.author && (job.company || job.location) && <p className="mono muted text-sm">postado por {job.author}</p>}
			</header>
			{reporting && <ReportJobDialog job={job} onClose={() => setReporting(false)} />}

			{job.necessaryKnowledge && (
				<BadgeList aria-label="Tecnologias">
					{job.necessaryKnowledge.map(skill => (
						<li className={badge()} key={skill}>
							{skill}
						</li>
					))}
				</BadgeList>
			)}

			<div className="detail-actions">
				<CvButton job={job} size="lg" />
				{applyLink && (
					<Button variant="ghost" size="lg" href={applyLink} target="_blank" rel="noopener noreferrer">
						<Icon name="external" />
						ir para a candidatura
					</Button>
				)}
				{/* Sem site nem e-mail, a candidatura é pelo próprio post: aí ele é um botão */}
				{postLink && appliesThroughPost && (
					<Button variant="ghost" size="lg" href={postLink} target="_blank" rel="noopener noreferrer">
						<Icon name="external" />
						ver post e se candidatar
					</Button>
				)}
			</div>

			{cv?.status === 'ready' && (
				<div className="cv-ready">
					<span className="pdf-icon mono text-xs" aria-hidden="true">
						PDF
					</span>
					<div className="grow min-0">
						<div className="strong text-sm">currículo pronto</div>
						<div className="mono muted text-xs ellipsis">{cv.fileName}</div>
					</div>
					<TextLink className="text-sm" href={cvPdfUrl(cv.requestId)} target="_blank" rel="noopener">
						pré-visualizar
					</TextLink>
				</div>
			)}
			{cv?.status === 'failed' && (
				<Notice tone="danger" className="text-sm">
					O currículo falhou: {cv.error}
				</Notice>
			)}

			{job.recruiterEmail && (
				<section className="stack-sm" aria-label="Contato">
					<h3 className={LABEL}>contato_</h3>
					<div className="copy-field text-sm">
						<a className="mono ellipsis grow" href={`mailto:${job.recruiterEmail}`}>
							{job.recruiterEmail}
						</a>
						<Button variant="ghost" onClick={() => copyText(job.recruiterEmail!, 'E-mail')}>
							<Icon name="copy" size={14} />
							copiar
						</Button>
					</div>
					<div className="message-box">
						<div className="row-between">
							<span className={LABEL}>{showGenerated ? 'mensagem gerada pela IA' : 'modelo de mensagem'}</span>
							<Button variant="ghost" size="xs" onClick={() => copyText(message, 'Mensagem')}>
								<Icon name="copy" size={13} />
								copiar
							</Button>
						</div>
						<pre className="mono message-text text-xs leading-relaxed">{message}</pre>
						{generated ? (
							<div className="row-between muted text-xs">
								<span>{showGenerated ? 'revise antes de enviar' : ''}</span>
								<TextLink className="text-xs" onClick={() => setUseDefaultMessage(!useDefaultMessage)}>
									{showGenerated ? 'usar o modelo padrão' : 'usar a mensagem da IA'}
								</TextLink>
							</div>
						) : (
							<p className="muted text-xs">
								{cv?.status === 'pending'
									? 'A mensagem escrita para esta vaga chega junto com o currículo.'
									: 'Gere o currículo para receber uma mensagem escrita para esta vaga.'}
							</p>
						)}
					</div>
				</section>
			)}

			<section className="stack-sm" aria-label="Post original">
				<div className="row-between">
					<h3 className={LABEL}>post original_</h3>
					{/* Com outra forma de candidatura, o post serve mais para conferir (debug): link discreto */}
					{postLink && !appliesThroughPost && (
						<TextLink className="text-xs mono" href={postLink} target="_blank" rel="noopener noreferrer">
							ir para o post ↗
						</TextLink>
					)}
				</div>
				<div className={cx('raw-post text-sm leading-relaxed', isLong && !expanded && 'collapsed')}>{job.rawContent}</div>
				{isLong && (
					<TextLink className="text-sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
						{expanded ? 'recolher post' : 'mostrar post completo'}
					</TextLink>
				)}
			</section>

			<footer className="detail-footer">
				{job.aiJobConfidence < LOW_CONFIDENCE && (
					<Notice tone="warn" className="text-sm">
						A IA não tem certeza de que isto é uma vaga. Confira o post.
					</Notice>
				)}
				<div className="row-between mono muted text-xs">
					<span>confiança da IA: {Math.round(job.aiJobConfidence)}%</span>
					{job.language && <span>idioma: {languageLabel(job.language)}</span>}
				</div>
				<TextLink className="text-xs mono" aria-expanded={rawJson !== null} disabled={loadingRaw} onClick={toggleRawJson}>
					{loadingRaw ? 'carregando json…' : rawJson !== null ? 'esconder json da vaga' : 'ver json da vaga (debug)'}
				</TextLink>
				{rawJson !== null && (
					<div className="message-box">
						<div className="row-between">
							<span className={LABEL}>documento no mongodb</span>
							<Button variant="ghost" size="xs" onClick={() => copyText(rawJson, 'JSON da vaga')}>
								<Icon name="copy" size={13} />
								copiar
							</Button>
						</div>
						<pre className="mono message-text json-text text-xs leading-relaxed">{rawJson}</pre>
					</div>
				)}
			</footer>
		</div>
	)
}
