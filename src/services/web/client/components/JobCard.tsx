import type { MouseEvent } from 'react'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { contractTypesLabel, jobDate, jobSubtitle, safeLink, senioritiesLabel, timeAgo } from '../lib/format'
import { jobPath, onLinkClick } from '../router'
import { useUnseen } from '../stores/seen'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { TextBadge } from './TextBadge'
import { WorkModeBadge } from './WorkModeBadge'

const VISIBLE_SKILLS = 4

/** Card da lista: otimizado para escanear (cargo, empresa · local, modalidade, nível, regime, quando, tecnologias) e agir rápido. */
export function JobCard({
	job,
	selected = false,
	onSelect,
}: {
	job: WebJob
	selected?: boolean
	/** Abre o detalhe no painel lateral (desktop); sem ele, o link leva à página da vaga. */
	onSelect?: (job: WebJob) => void
}) {
	const unseen = useUnseen(job)
	const skills = job.necessaryKnowledge ?? []
	const hidden = skills.length - VISIBLE_SKILLS
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)

	function open(event: MouseEvent<HTMLAnchorElement>) {
		if (onSelect && !event.metaKey && !event.ctrlKey && event.button === 0) {
			event.preventDefault()
			onSelect(job)
			return
		}
		onLinkClick(event)
	}

	return (
		<article className={cx('card job-card', selected && 'selected')} aria-current={selected ? 'true' : undefined}>
			<div className="job-card-head">
				<a className="job-card-title" href={jobPath(job.postId)} onClick={open}>
					<span className="job-title">
						{unseen && <span className="unseen-dot" />}
						{unseen && <span className="sr-only">vaga nova:</span>}
						{job.title}
					</span>
					<span className="muted job-sub">{jobSubtitle(job)}</span>
				</a>
				<div className="job-card-meta">
					<div className="job-badges">
						<TextBadge label={senioritiesLabel(job)} />
						<TextBadge label={contractTypesLabel(job)} />
						<WorkModeBadge job={job} />
					</div>
					<time className="mono muted small" dateTime={jobDate(job)}>
						{timeAgo(jobDate(job))}
					</time>
				</div>
			</div>

			{skills.length > 0 && (
				<ul className="chips" aria-label="Tecnologias">
					{skills.slice(0, VISIBLE_SKILLS).map(skill => (
						<li className="chip" key={skill}>
							{skill}
						</li>
					))}
					{hidden > 0 && (
						<li className="chip chip-more" title={skills.slice(VISIBLE_SKILLS).join(', ')}>
							+{hidden}
						</li>
					)}
				</ul>
			)}

			<div className="job-card-actions">
				<span className="mono muted small contact-hint">
					{job.recruiterEmail ? (
						<>
							<Icon name="mail" size={14} />
							tem e-mail de contato
						</>
					) : applyLink ? (
						'candidatura pelo site da vaga'
					) : (
						'candidatura pelo post'
					)}
				</span>
				{/* A candidatura: o site da vaga ou, sem site nem e-mail, o post (o link do post para conferir fica no detalhe) */}
				{applyLink ? (
					<a className="btn btn-ghost" href={applyLink} target="_blank" rel="noopener noreferrer">
						<Icon name="external" size={14} />
						candidatar-se
					</a>
				) : (
					postLink &&
					!job.recruiterEmail && (
						<a className="btn btn-ghost" href={postLink} target="_blank" rel="noopener noreferrer">
							<Icon name="external" size={14} />
							abrir post
						</a>
					)
				)}
				<CvButton job={job} />
			</div>
		</article>
	)
}

export function JobCardSkeleton() {
	return (
		<div className="card job-card skeleton" aria-hidden="true">
			<div className="sk sk-line" style={{ width: '62%' }} />
			<div className="sk sk-line sm" style={{ width: '40%' }} />
			<div className="sk-row">
				<div className="sk sk-chip" />
				<div className="sk sk-chip" />
				<div className="sk sk-chip" />
			</div>
		</div>
	)
}
