import { defineComponent, ref, watch, type PropType } from 'vue'

import { applicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { cvPdfUrl } from '../api'
import { jobDate, jobSubtitle, languageLabel, safeLink, timeAgo } from '../lib/format'
import { cvFor } from '../stores/cv'
import { copyText } from '../stores/toast'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { WorkModeBadge } from './WorkModeBadge'

/** Posts maiores que isso começam recolhidos. */
const LONG_POST_CHARS = 600
const LOW_CONFIDENCE = 75

/** Todos os dados da vaga, com as ações de candidatura (painel lateral no desktop, página própria no celular). */
export const JobDetail = defineComponent({
	name: 'JobDetail',
	props: { job: { type: Object as PropType<WebJob>, required: true } },
	setup(props) {
		const expanded = ref(false)
		watch(
			() => props.job.postId,
			() => (expanded.value = false),
		)

		return () => {
			const { job } = props
			const link = safeLink(job.link)
			const message = applicationMessage(job.title)
			const cv = cvFor(job.postId)
			const isLong = job.rawContent.length > LONG_POST_CHARS

			return (
				<div class="job-detail">
					<header class="stack-sm">
						<div class="row-between">
							<WorkModeBadge job={job} />
							<time class="mono muted small" datetime={jobDate(job)}>
								publicada {timeAgo(jobDate(job))}
							</time>
						</div>
						<h2 class="detail-title">{job.title}</h2>
						{jobSubtitle(job) && <p class="muted">{jobSubtitle(job)}</p>}
						{job.author && (job.company || job.location) && <p class="mono muted small">postado por {job.author}</p>}
					</header>

					{job.necessary_knowledge && (
						<ul class="chips" aria-label="Tecnologias">
							{job.necessary_knowledge.map(skill => (
								<li class="chip" key={skill}>
									{skill}
								</li>
							))}
						</ul>
					)}

					<div class="detail-actions">
						<CvButton job={job} size="lg" />
						{link && (
							<a class="btn btn-ghost btn-lg" href={link} target="_blank" rel="noopener noreferrer">
								<Icon name="external" />
								{job.recruiter_email ? 'abrir post' : 'ver post e se candidatar'}
							</a>
						)}
					</div>

					{cv?.status === 'ready' && (
						<div class="cv-ready">
							<span class="pdf-icon mono" aria-hidden="true">
								PDF
							</span>
							<div class="grow min-0">
								<div class="strong small">currículo pronto</div>
								<div class="mono muted xsmall ellipsis">{cv.fileName}</div>
							</div>
							<a class="link small" href={cvPdfUrl(cv.requestId)} target="_blank" rel="noopener">
								pré-visualizar
							</a>
						</div>
					)}
					{cv?.status === 'failed' && (
						<p class="notice notice-danger small" role="alert">
							O currículo falhou: {cv.error}
						</p>
					)}

					{job.recruiter_email && (
						<section class="stack-sm" aria-label="Contato">
							<h3 class="label">contato_</h3>
							<div class="copy-field">
								<a class="mono ellipsis grow" href={`mailto:${job.recruiter_email}`}>
									{job.recruiter_email}
								</a>
								<button type="button" class="btn btn-ghost" onClick={() => copyText(job.recruiter_email!, 'E-mail')}>
									<Icon name="copy" size={14} />
									copiar
								</button>
							</div>
							<div class="message-box">
								<div class="row-between">
									<span class="label">modelo de mensagem</span>
									<button type="button" class="btn btn-ghost btn-xs" onClick={() => copyText(message, 'Modelo de mensagem')}>
										<Icon name="copy" size={13} />
										copiar
									</button>
								</div>
								<pre class="mono message-text">{message}</pre>
							</div>
						</section>
					)}

					<section class="stack-sm" aria-label="Post original">
						<h3 class="label">post original_</h3>
						<div class={['raw-post', isLong && !expanded.value && 'collapsed']}>{job.rawContent}</div>
						{isLong && (
							<button
								type="button"
								class="link-btn small"
								aria-expanded={expanded.value}
								onClick={() => (expanded.value = !expanded.value)}
							>
								{expanded.value ? 'recolher post' : 'mostrar post completo'}
							</button>
						)}
					</section>

					<footer class="detail-footer">
						{job.aiJobConfidence < LOW_CONFIDENCE && (
							<p class="notice notice-warn small">A IA não tem certeza de que isto é uma vaga. Confira o post.</p>
						)}
						<div class="row-between mono muted xsmall">
							<span>confiança da IA: {Math.round(job.aiJobConfidence)}%</span>
							{job.language && <span>idioma: {languageLabel(job.language)}</span>}
						</div>
					</footer>
				</div>
			)
		}
	},
})
