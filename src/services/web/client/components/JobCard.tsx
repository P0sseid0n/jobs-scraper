import { Link } from '@tanstack/react-router'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { jobDate, jobSubtitle, safeLink, timeAgo } from '../lib/format'
import { jobParams } from '../router'
import { filtersOpen } from '../stores/filters-panel'
import { setViewed, useViewed } from '../stores/viewed'
import { ContractTypeBadge } from './ContractTypeBadge'
import { CorrectedBadge } from './CorrectedBadge'
import { ExtractionChecksBadge } from './ExtractionChecksBadge'
import { Icon } from './Icon'
import { ListingBadge } from './ListingBadge'
import { badge, BadgeList } from './ui/Badge'
import { card } from './ui/Card'
import { Skeleton } from './ui/Skeleton'
import { StatusDot } from './ui/StatusDot'
import { WorkModeBadge } from './WorkModeBadge'

const VISIBLE_SKILLS = 4

const JOB_CARD = card({ size: 'md', className: 'flex flex-col gap-3 transition-colors' })
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
			{/* No celular, os selos e a data descem para debaixo do cargo: ao lado, espremiam o cargo até quebrar no meio da palavra */}
			<div className="flex items-start gap-3 max-md:flex-col max-md:gap-2">
				{/* O card todo abre a vaga: o after do link cobre o card; só a bolinha fica por cima */}
				<Link
					className="group flex min-w-0 flex-1 flex-col gap-1 no-underline after:absolute after:inset-0 after:rounded-lg"
					to="/vagas/$id"
					params={jobParams(job.postId)}
					// Os filtros da lista continuam na URL
					search
					resetScroll={!keepScroll}
					// Escolhida a vaga, os filtros saem do caminho (a vaga ganha o espaço deles)
					onClick={() => filtersOpen.set(false)}
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
				<div className="flex shrink-0 flex-col items-end gap-1.5 max-md:w-full max-md:flex-row max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<ExtractionChecksBadge job={job} iconOnly />
						<CorrectedBadge job={job} />
						<ListingBadge job={job} />
						<ContractTypeBadge job={job} />
						<WorkModeBadge job={job} />
					</div>
					<time className="font-mono text-muted text-sm whitespace-nowrap" dateTime={jobDate(job)}>
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
						com e-mail de contato
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
 * fica na margem esquerda, na altura do cargo. Na vaga vista, um círculo vazado fica no lugar, sempre visível (sem
 * depender do hover, que não existe no toque), com contraste de 3:1 como os outros controles.
 *
 * A área de clique tem 44×44px em qualquer aparelho (WCAG 2.5.5 e Apple; o mínimo AA é 24px), centrada na bolinha
 * para que errar por pouco para qualquer lado ainda acerte. Ela avança uns 8px no começo do cargo: marcar sem querer
 * aparece na hora e se desfaz com outro toque, e abrir a vaga sem querer troca de página (e ainda a marca como vista).
 */
function ViewedDot({ job, viewed }: { job: WebJob; viewed: boolean }) {
	const action = viewed ? 'marcar como não vista' : 'marcar como vista'

	return (
		<button
			type="button"
			// Com o cargo no nome: numa lista, "marcar como vista" sozinho não diz qual vaga
			aria-label={`${action}: ${job.title}`}
			title={action}
			className={cx(
				'group/dot absolute top-4.5 left-0 z-10 grid h-5.5 w-8 place-items-center border-0 bg-transparent p-0 max-md:top-4 max-md:w-7',
				'after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-1/2',
			)}
			onClick={() => void setViewed(job, !viewed)}
		>
			{viewed ? (
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full border border-current text-muted transition duration-300 ease-spring group-hover/dot:scale-125 group-hover/dot:text-ink group-active/dot:scale-90 group-active/dot:duration-75"
				/>
			) : (
				<StatusDot
					tone="lime"
					glow
					className="size-2.5 transition duration-300 ease-spring group-hover/dot:scale-125 group-active/dot:scale-90 group-active/dot:duration-75"
				/>
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
