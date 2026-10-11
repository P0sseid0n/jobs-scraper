import { defineComponent, ref, watch, type PropType } from 'vue'

import { applicationMessage } from '@shared/templates'

import type { WebJob } from '../../api-types'
import { api, cvPdfUrl, RequestError } from '../api'
import { jobDate, jobSubtitle, languageLabel, safeLink, timeAgo } from '../lib/format'
import { cvFor } from '../stores/cv'
import { copyText, notify } from '../stores/toast'
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

		// Depuração: o documento da vaga no MongoDB, buscado só quando pedido
		const rawJson = ref<string | null>(null)
		const loadingRaw = ref(false)

		watch(
			() => props.job.postId,
			() => {
				expanded.value = false
				rawJson.value = null
			},
		)

		async function toggleRawJson() {
			if (rawJson.value !== null) {
				rawJson.value = null
				return
			}

			const postId = props.job.postId
			loadingRaw.value = true

			try {
				const doc = await api.rawJob(postId)
				// Outra vaga foi aberta enquanto carregava
				if (props.job.postId === postId) rawJson.value = JSON.stringify(doc, null, 2)
			} catch (error) {
				notify(error instanceof RequestError ? error.message : 'Não consegui carregar o JSON da vaga', 'error')
			} finally {
				loadingRaw.value = false
			}
		}

		return () => {
			const { job } = props
			const postLink = safeLink(job.postLink)
			const applyLink = safeLink(job.applyLink)
			const appliesThroughPost = !applyLink && !job.recruiterEmail
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

					{job.necessaryKnowledge && (
						<ul class="chips" aria-label="Tecnologias">
							{job.necessaryKnowledge.map(skill => (
								<li class="chip" key={skill}>
									{skill}
								</li>
							))}
						</ul>
					)}

					<div class="detail-actions">
						<CvButton job={job} size="lg" />
						{applyLink && (
							<a class="btn btn-ghost btn-lg" href={applyLink} target="_blank" rel="noopener noreferrer">
								<Icon name="external" />
								ir para a candidatura
							</a>
						)}
						{/* Sem site nem e-mail, a candidatura é pelo próprio post: aí ele é um botão */}
						{postLink && appliesThroughPost && (
							<a class="btn btn-ghost btn-lg" href={postLink} target="_blank" rel="noopener noreferrer">
								<Icon name="external" />
								ver post e se candidatar
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

					{job.recruiterEmail && (
						<section class="stack-sm" aria-label="Contato">
							<h3 class="label">contato_</h3>
							<div class="copy-field">
								<a class="mono ellipsis grow" href={`mailto:${job.recruiterEmail}`}>
									{job.recruiterEmail}
								</a>
								<button type="button" class="btn btn-ghost" onClick={() => copyText(job.recruiterEmail!, 'E-mail')}>
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
						<div class="row-between">
							<h3 class="label">post original_</h3>
							{/* Com outra forma de candidatura, o post serve mais para conferir (debug): link discreto */}
							{postLink && !appliesThroughPost && (
								<a class="link xsmall mono muted" href={postLink} target="_blank" rel="noopener noreferrer">
									ir para o post ↗
								</a>
							)}
						</div>
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
						<button
							type="button"
							class="link-btn xsmall mono"
							aria-expanded={rawJson.value !== null}
							disabled={loadingRaw.value}
							onClick={toggleRawJson}
						>
							{loadingRaw.value
								? 'carregando json…'
								: rawJson.value !== null
									? 'esconder json da vaga'
									: 'ver json da vaga (debug)'}
						</button>
						{rawJson.value !== null && (
							<div class="message-box">
								<div class="row-between">
									<span class="label">documento no mongodb</span>
									<button type="button" class="btn btn-ghost btn-xs" onClick={() => copyText(rawJson.value!, 'JSON da vaga')}>
										<Icon name="copy" size={13} />
										copiar
									</button>
								</div>
								<pre class="mono message-text json-text">{rawJson.value}</pre>
							</div>
						)}
					</footer>
				</div>
			)
		}
	},
})
