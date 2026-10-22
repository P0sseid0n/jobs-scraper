import { Link } from '@tanstack/react-router'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, safeLink, timeAgo } from '../lib/format'
import { jobParams } from '../router'
import { setViewed, useViewed } from '../stores/viewed'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CorrectedBadge } from './CorrectedBadge'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { ListingBadge } from './ListingBadge'
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
	keepScroll = false,
}: {
	job: WebJob
	selected?: boolean
	/** Não volta ao topo ao abrir: no desktop a vaga abre no painel ao lado da lista. */
	keepScroll?: boolean
}) {
	const viewed = useViewed(job)
	const skills = job.necessaryKnowledge ?? []
	const hidden = skills.length - VISIBLE_SKILLS
	const postLink = safeLink(job.postLink)
	const applyLink = safeLink(job.applyLink)

	return (
		<article
			className={cx(JOB_CARD, 'group/card', selected ? 'inverted border-inv-bg' : 'hover:border-line-strong')}
			aria-current={selected ? 'true' : undefined}
		>
			<div className="flex items-start gap-3">
				<Link
					className="group flex min-w-0 flex-1 flex-col gap-1 no-underline"
					to="/vagas/$id"
					params={jobParams(job.postId)}
					// Os filtros da lista continuam na URL
					search
					resetScroll={!keepScroll}
				>
					{/* Já vista: o cargo perde o contraste; não vista: a bolinha */}
					<span
						className={cx(
							'flex items-center gap-2 text-base leading-snug font-semibold wrap-break-word group-hover:underline group-hover:underline-offset-3',
							viewed && 'text-muted',
						)}
					>
						{!viewed && <StatusDot tone="lime" glow />}
						{!viewed && <span className="sr-only">não vista:</span>}
						{job.title}
					</span>
					<span className="text-muted text-sm">{jobSubtitle(job)}</span>
				</Link>
				<div className="flex shrink-0 flex-col items-end gap-1.5">
					<div className="flex flex-wrap items-center gap-1.5">
						<CorrectedBadge job={job} />
						<ListingBadge job={job} />
						<ContractTypeBadge job={job} />
						<WorkModeBadge job={job} />
					</div>
					{/*
					 * Desfazer a marcação é raro, então fica escondido: no card visto, o mouse sobre o card troca a data pelo
					 * botão, no mesmo lugar e sem mexer no resto (como as ações de um e-mail na caixa de entrada). No toque não há
					 * hover; lá o link fica no rodapé do detalhe
					 */}
					<div className="group/when grid items-center justify-items-end">
						<time
							className={cx(
								'col-start-1 row-start-1 font-mono text-muted text-sm transition-opacity',
								viewed && 'pointer-fine:group-hover/card:opacity-0 group-has-focus-visible/when:opacity-0',
							)}
							dateTime={jobDate(job)}
						>
							{timeAgo(jobDate(job))}
						</time>
						{viewed && (
							<button
								type="button"
								className="relative col-start-1 row-start-1 inline-flex items-center gap-1.5 border-0 bg-transparent p-0 font-mono text-muted text-xs whitespace-nowrap underline-offset-3 opacity-0 transition-opacity hover:text-ink hover:underline pointer-coarse:hidden group-hover/card:opacity-100 focus-visible:opacity-100"
								onClick={() => void setViewed(job, false)}
							>
								<Icon name="eye-off" size={14} />
								marcar não vista
							</button>
						)}
					</div>
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
				<span className="font-mono text-muted inline-flex flex-auto items-center gap-1.5 text-xs max-md:basis-full">
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
