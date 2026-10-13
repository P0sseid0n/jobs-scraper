import type { MouseEvent } from 'react'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, safeLink, timeAgo } from '../lib/format'
import { jobPath, onLinkClick } from '../router'
import { useUnseen } from '../stores/seen'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { badge, BadgeList } from './ui/Badge'
import { Button } from './ui/Button'
import { card } from './ui/Card'
import { Skeleton } from './ui/Skeleton'
import { StatusDot } from './ui/StatusDot'
import { WorkModeBadge } from './WorkModeBadge'

const VISIBLE_SKILLS = 4

const JOB_CARD = card({ className: 'flex flex-col gap-3 px-4.5 py-4 transition-colors max-md:p-3.5' })

/** Card da lista: otimizado para escanear (cargo, empresa · local, modalidade, regime, quando, tecnologias) e agir rápido. */
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
		<article
			className={cx(JOB_CARD, selected ? 'inverted border-inv-bg' : 'hover:border-line-strong')}
			aria-current={selected ? 'true' : undefined}
		>
			<div className="flex items-start gap-3">
				<a className="group flex min-w-0 flex-1 flex-col gap-1 no-underline" href={jobPath(job.postId)} onClick={open}>
					<span className="flex items-center gap-2 text-base leading-snug font-semibold wrap-break-word group-hover:underline group-hover:underline-offset-3">
						{unseen && <StatusDot tone="lime" glow />}
						{unseen && <span className="sr-only">vaga nova:</span>}
						{job.title}
					</span>
					<span className="text-muted text-sm">{jobSubtitle(job)}</span>
				</a>
				<div className="flex shrink-0 flex-col items-end gap-1.5">
					<div className="flex flex-wrap items-center gap-1.5">
						<ContractTypeBadge job={job} />
						<WorkModeBadge job={job} />
					</div>
					<time className="font-mono text-muted text-sm" dateTime={jobDate(job)}>
						{timeAgo(jobDate(job))}
					</time>
				</div>
			</div>

			{skills.length > 0 && (
				<BadgeList aria-label="Tecnologias">
					{skills.slice(0, VISIBLE_SKILLS).map(skill => (
						<li className={badge()} key={skill}>
							{skill}
						</li>
					))}
					{hidden > 0 && (
						<li className={badge({ className: 'opacity-80' })} title={skills.slice(VISIBLE_SKILLS).join(', ')}>
							+{hidden}
						</li>
					)}
				</BadgeList>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-muted inline-flex flex-auto items-center gap-1.5 text-sm max-md:basis-full">
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
					<Button variant="ghost" className="max-md:flex-auto" href={applyLink} external>
						candidatar-se
					</Button>
				) : (
					postLink &&
					!job.recruiterEmail && (
						<Button variant="ghost" className="max-md:flex-auto" href={postLink} external>
							abrir post
						</Button>
					)
				)}
				<CvButton job={job} className="max-md:flex-auto" />
			</div>
		</article>
	)
}

export function JobCardSkeleton() {
	return (
		<div className={JOB_CARD} aria-hidden="true">
			<Skeleton className="h-3.5 w-2/3 rounded-xs bg-surface-2" />
			<Skeleton className="h-2.5 w-2/5 rounded-xs bg-surface-2" />
			<div className="flex gap-1.5">
				{[1, 2, 3].map(key => (
					<Skeleton key={key} className="h-5 w-16 rounded-pill bg-surface-2" />
				))}
			</div>
		</div>
	)
}
