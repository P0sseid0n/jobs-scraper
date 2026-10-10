import { defineComponent, type PropType } from 'vue'

import type { WebJob } from '../../api-types'
import { jobDate, jobSubtitle, safeLink, timeAgo } from '../lib/format'
import { jobPath, onLinkClick } from '../router'
import { isUnseen } from '../stores/seen'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { WorkModeBadge } from './WorkModeBadge'

const VISIBLE_SKILLS = 4

/** Card da lista: otimizado para escanear (cargo, empresa · local, modalidade, quando, tecnologias) e agir rápido. */
export const JobCard = defineComponent({
	name: 'JobCard',
	props: {
		job: { type: Object as PropType<WebJob>, required: true },
		selected: { type: Boolean, default: false },
		/** Abre o detalhe no painel lateral (desktop); sem ele, o link leva à página da vaga. */
		onSelect: { type: Function as PropType<(job: WebJob) => void> },
	},
	setup(props) {
		function open(event: MouseEvent) {
			if (props.onSelect && !event.metaKey && !event.ctrlKey && event.button === 0) {
				event.preventDefault()
				props.onSelect(props.job)
				return
			}
			onLinkClick(event)
		}

		return () => {
			const { job } = props
			const skills = job.necessary_knowledge ?? []
			const hidden = skills.length - VISIBLE_SKILLS
			const link = safeLink(job.link)
			const unseen = isUnseen(job)

			return (
				<article class={['card job-card', props.selected && 'selected']} aria-current={props.selected ? 'true' : undefined}>
					<div class="job-card-head">
						<a class="job-card-title" href={jobPath(job.postId)} onClick={open}>
							<span class="job-title">
								{unseen && <span class="unseen-dot" />}
								{unseen && <span class="sr-only">vaga nova:</span>}
								{job.title}
							</span>
							<span class="muted job-sub">{jobSubtitle(job)}</span>
						</a>
						<div class="job-card-meta">
							<WorkModeBadge job={job} />
							<time class="mono muted small" datetime={jobDate(job)}>
								{timeAgo(jobDate(job))}
							</time>
						</div>
					</div>

					{skills.length > 0 && (
						<ul class="chips" aria-label="Tecnologias">
							{skills.slice(0, VISIBLE_SKILLS).map(skill => (
								<li class="chip" key={skill}>
									{skill}
								</li>
							))}
							{hidden > 0 && (
								<li class="chip chip-more" title={skills.slice(VISIBLE_SKILLS).join(', ')}>
									+{hidden}
								</li>
							)}
						</ul>
					)}

					<div class="job-card-actions">
						<span class="mono muted small contact-hint">
							{job.recruiter_email ? (
								<>
									<Icon name="mail" size={14} />
									tem e-mail de contato
								</>
							) : (
								'candidatura pelo post'
							)}
						</span>
						{link && (
							<a class="btn btn-ghost" href={link} target="_blank" rel="noopener noreferrer">
								<Icon name="external" size={14} />
								abrir post
							</a>
						)}
						<CvButton job={job} />
					</div>
				</article>
			)
		}
	},
})

export const JobCardSkeleton = defineComponent({
	name: 'JobCardSkeleton',
	setup() {
		return () => (
			<div class="card job-card skeleton" aria-hidden="true">
				<div class="sk sk-line" style={{ width: '62%' }} />
				<div class="sk sk-line sm" style={{ width: '40%' }} />
				<div class="sk-row">
					<div class="sk sk-chip" />
					<div class="sk sk-chip" />
					<div class="sk sk-chip" />
				</div>
			</div>
		)
	},
})
