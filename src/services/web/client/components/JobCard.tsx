import { Link } from '@tanstack/react-router'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, safeLink, timeAgo } from '../lib/format'
import { jobParams } from '../router'
import { setViewed, useViewed } from '../stores/viewed'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CorrectedBadge } from './CorrectedBadge'
import { Icon } from './Icon'
import { ListingBadge } from './ListingBadge'
import { badge, BadgeList } from './ui/Badge'
import { card } from './ui/Card'
import { Skeleton } from './ui/Skeleton'
import { StatusDot } from './ui/StatusDot'
import { WorkModeBadge } from './WorkModeBadge'

const VISIBLE_SKILLS = 4

const JOB_CARD = card({ className: 'flex flex-col gap-3 px-4.5 py-4 transition-colors max-md:p-3.5' })
/** A margem esquerda maior é a coluna da bolinha de não vista (todo o conteúdo do card fica alinhado depois dela). */
const DOT_GUTTER = 'pl-8 max-md:pl-7'

/** Card da lista: otimizado para escanear (cargo, empresa · local, modalidade, regime, quando, tecnologias); a candidatura fica no detalhe. */
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

	return (
		<article
			className={cx(JOB_CARD, DOT_GUTTER, 'group/card relative', selected ? 'inverted border-inv-bg' : 'hover:border-line-strong')}
			aria-current={selected ? 'true' : undefined}
		>
			<ViewedDot job={job} viewed={viewed} />
			<div className="flex items-start gap-3">
				{/* O card todo abre a vaga: o after do link cobre o card; só a bolinha fica por cima */}
				<Link
					className="group flex min-w-0 flex-1 flex-col gap-1 no-underline after:absolute after:inset-0 after:rounded-lg"
					to="/vagas/$id"
					params={jobParams(job.postId)}
					// Os filtros da lista continuam na URL
					search
					resetScroll={!keepScroll}
				>
					{/* Já vista: o cargo perde o contraste; não vista: a bolinha (fora do link, na margem do card) */}
					<span
						className={cx(
							'text-base leading-snug font-semibold wrap-break-word group-hover:underline group-hover:underline-offset-3',
							viewed && 'text-muted',
						)}
					>
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

			{/* Só o canal da candidatura: os botões ficam no detalhe, para a pessoa ler a vaga antes de se candidatar */}
			<span className="font-mono text-muted inline-flex items-center gap-1.5 text-xs">
				{job.recruiterEmail ? (
					<>
						<Icon name="mail" size={14} />
						tem e-mail de contato
					</>
				) : safeLink(job.applyLink) ? (
					'candidatura pelo site da vaga'
				) : (
					'candidatura pelo post'
				)}
			</span>
		</article>
	)
}

/**
 * A bolinha de não vista é também o botão que muda o estado, como o indicador de não lida do Outlook e do Apple Mail:
 * fica na margem esquerda, na altura do cargo. Na vaga vista, um círculo vazado aparece no lugar com o mouse sobre o
 * card. No toque não há hover: a bolinha só indica, e o link para desmarcar fica no rodapé do detalhe.
 */
function ViewedDot({ job, viewed }: { job: WebJob; viewed: boolean }) {
	const label = viewed ? 'marcar como não vista' : 'marcar como vista'

	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={cx(
				'absolute top-4 left-0 z-10 grid h-5.5 w-8 place-items-center border-0 bg-transparent p-0 max-md:top-3.5 max-md:w-7',
				'pointer-coarse:pointer-events-none',
				viewed && 'opacity-0 transition-opacity pointer-coarse:hidden group-hover/card:opacity-100 focus-visible:opacity-100',
			)}
			onClick={() => void setViewed(job, !viewed)}
		>
			{viewed ? (
				<span aria-hidden="true" className="size-2 rounded-full border border-current text-muted transition hover:scale-125" />
			) : (
				<StatusDot tone="lime" glow className="transition pointer-fine:hover:scale-125" />
			)}
		</button>
	)
}

export function JobCardSkeleton() {
	return (
		<div className={cx(JOB_CARD, DOT_GUTTER)} aria-hidden="true">
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
