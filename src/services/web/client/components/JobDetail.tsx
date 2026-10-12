import { useState } from 'react'

import { applicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { api, cvPdfUrl, RequestError } from '../api'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, languageLabel, safeLink, timeAgo } from '../lib/format'
import { useCvFor } from '../stores/cv'
import { copyText, notify } from '../stores/toast'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600
const LOW_CONFIDENCE = 75

/** Todos os dados da vaga, com as ações de candidatura (painel lateral no desktop, página própria no celular). */
export function JobDetail({ job }: { job: WebJob }) {
	// Outra vaga começa do zero: post recolhido e sem o JSON da anterior
	return <JobDetailContent key={job.postId} job={job} />
}

function JobDetailContent({ job }: { job: WebJob }) {
	const [expanded, setExpanded] = useState(false)

	// Depuração: o documento da vaga no MongoDB, buscado só quando pedido
	const [rawJson, setRawJson] = useState<string | null>(null)
	const [loadingRaw, setLoadingRaw] = useState(false)

	const cv = useCvFor(job.postId)
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)
	const appliesThroughPost = !applyLink && !job.recruiterEmail
	const message = applicationMessage(job.title)
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
					<WorkModeBadge job={job} />
					<time className="mono muted small" dateTime={jobDate(job)}>
						publicada {timeAgo(jobDate(job))}
					</time>
				</div>
				<h2 className="detail-title">{job.title}</h2>
				{jobSubtitle(job) && <p className="muted">{jobSubtitle(job)}</p>}
				{job.author && (job.company || job.location) && <p className="mono muted small">postado por {job.author}</p>}
			</header>

			{job.necessaryKnowledge && (
				<ul className="chips" aria-label="Tecnologias">
					{job.necessaryKnowledge.map(skill => (
						<li className="chip" key={skill}>
							{skill}
						</li>
					))}
				</ul>
			)}

			<div className="detail-actions">
				<CvButton job={job} size="lg" />
				{applyLink && (
					<a className="btn btn-ghost btn-lg" href={applyLink} target="_blank" rel="noopener noreferrer">
						<Icon name="external" />
						ir para a candidatura
					</a>
				)}
				{/* Sem site nem e-mail, a candidatura é pelo próprio post: aí ele é um botão */}
				{postLink && appliesThroughPost && (
					<a className="btn btn-ghost btn-lg" href={postLink} target="_blank" rel="noopener noreferrer">
						<Icon name="external" />
						ver post e se candidatar
					</a>
				)}
			</div>

			{cv?.status === 'ready' && (
				<div className="cv-ready">
					<span className="pdf-icon mono" aria-hidden="true">
						PDF
					</span>
					<div className="grow min-0">
						<div className="strong small">currículo pronto</div>
						<div className="mono muted xsmall ellipsis">{cv.fileName}</div>
					</div>
					<a className="link small" href={cvPdfUrl(cv.requestId)} target="_blank" rel="noopener">
						pré-visualizar
					</a>
				</div>
			)}
			{cv?.status === 'failed' && (
				<p className="notice notice-danger small" role="alert">
					O currículo falhou: {cv.error}
				</p>
			)}

			{job.recruiterEmail && (
				<section className="stack-sm" aria-label="Contato">
					<h3 className="label">contato_</h3>
					<div className="copy-field">
						<a className="mono ellipsis grow" href={`mailto:${job.recruiterEmail}`}>
							{job.recruiterEmail}
						</a>
						<button type="button" className="btn btn-ghost" onClick={() => copyText(job.recruiterEmail!, 'E-mail')}>
							<Icon name="copy" size={14} />
							copiar
						</button>
					</div>
					<div className="message-box">
						<div className="row-between">
							<span className="label">modelo de mensagem</span>
							<button type="button" className="btn btn-ghost btn-xs" onClick={() => copyText(message, 'Modelo de mensagem')}>
								<Icon name="copy" size={13} />
								copiar
							</button>
						</div>
						<pre className="mono message-text">{message}</pre>
					</div>
				</section>
			)}

			<section className="stack-sm" aria-label="Post original">
				<div className="row-between">
					<h3 className="label">post original_</h3>
					{/* Com outra forma de candidatura, o post serve mais para conferir (debug): link discreto */}
					{postLink && !appliesThroughPost && (
						<a className="link xsmall mono muted" href={postLink} target="_blank" rel="noopener noreferrer">
							ir para o post ↗
						</a>
					)}
				</div>
				<div className={cx('raw-post', isLong && !expanded && 'collapsed')}>{job.rawContent}</div>
				{isLong && (
					<button type="button" className="link-btn small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
						{expanded ? 'recolher post' : 'mostrar post completo'}
					</button>
				)}
			</section>

			<footer className="detail-footer">
				{job.aiJobConfidence < LOW_CONFIDENCE && (
					<p className="notice notice-warn small">A IA não tem certeza de que isto é uma vaga. Confira o post.</p>
				)}
				<div className="row-between mono muted xsmall">
					<span>confiança da IA: {Math.round(job.aiJobConfidence)}%</span>
					{job.language && <span>idioma: {languageLabel(job.language)}</span>}
				</div>
				<button
					type="button"
					className="link-btn xsmall mono"
					aria-expanded={rawJson !== null}
					disabled={loadingRaw}
					onClick={toggleRawJson}
				>
					{loadingRaw ? 'carregando json…' : rawJson !== null ? 'esconder json da vaga' : 'ver json da vaga (debug)'}
				</button>
				{rawJson !== null && (
					<div className="message-box">
						<div className="row-between">
							<span className="label">documento no mongodb</span>
							<button type="button" className="btn btn-ghost btn-xs" onClick={() => copyText(rawJson, 'JSON da vaga')}>
								<Icon name="copy" size={13} />
								copiar
							</button>
						</div>
						<pre className="mono message-text json-text">{rawJson}</pre>
					</div>
				)}
			</footer>
		</div>
	)
}
