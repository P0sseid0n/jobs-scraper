import { defineComponent, onMounted } from 'vue'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { Icon } from '../components/Icon'
import { formatDateTime } from '../lib/format'
import { jobPath, onLinkClick } from '../router'
import { allCvRequests, cvError, cvLoaded, loadCvRequests, requestCv } from '../stores/cv'
import { notify } from '../stores/toast'

/** "Meus currículos": os PDFs gerados pelo site, para baixar de novo sem gerar outro. */
export const CvsView = defineComponent({
	name: 'CvsView',
	setup() {
		onMounted(loadCvRequests)

		async function retry(request: WebCvRequest) {
			try {
				await requestCv(request)
			} catch (error) {
				notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
			}
		}

		function renderItem(request: WebCvRequest) {
			const title = (
				<a class="strong ellipsis" href={jobPath(request.postId)} onClick={onLinkClick}>
					{request.jobTitle ?? 'Vaga'}
				</a>
			)
			const meta = [request.company, formatDateTime(request.finishedAt ?? request.requestedAt)].filter(Boolean).join(' · ')

			return (
				<li key={request.requestId} class={['card cv-row', `cv-${request.status}`]}>
					<span class={['pdf-icon mono', request.status === 'pending' && 'dashed']} aria-hidden="true">
						{request.status === 'pending' ? <Icon name="spinner" size={14} /> : request.status === 'failed' ? 'erro' : 'PDF'}
					</span>
					<div class="grow min-0 stack-xxs">
						{title}
						<span class="mono muted xsmall">
							{request.status === 'pending' ? `gerando · pedido ${formatDateTime(request.requestedAt)}` : meta}
						</span>
						{request.status === 'failed' && <span class="small danger-text">{request.error}</span>}
					</div>
					{request.status === 'ready' && (
						<div class="row-actions">
							<a class="btn btn-ghost" href={cvPdfUrl(request.requestId)} target="_blank" rel="noopener">
								abrir
							</a>
							<a class="btn btn-lime" href={cvPdfUrl(request.requestId, true)} download={request.fileName ?? undefined}>
								<Icon name="download" size={14} />
								baixar
							</a>
						</div>
					)}
					{request.status === 'failed' && (
						<button type="button" class="btn btn-ghost" onClick={() => retry(request)}>
							tentar de novo
						</button>
					)}
				</li>
			)
		}

		return () => {
			const requests = allCvRequests.value
			const pending = requests.filter(request => request.status === 'pending')
			const done = requests.filter(request => request.status !== 'pending')

			return (
				<div class="page page-medium">
					<section class="hero">
						<div>
							<h1 class="display">
								meus <span class="mono display-mono">currículos.</span>
							</h1>
							<p class="muted lead">
								Um PDF de uma página por vaga: apresentação reescrita para a vaga, tecnologias pedidas nas habilidades,
								projetos do GitHub mais relevantes e a experiência reordenada.
							</p>
						</div>
					</section>

					{cvError.value && (
						<div class="notice notice-danger" role="alert">
							Não consegui carregar os currículos: {cvError.value}
						</div>
					)}

					{cvLoaded.value && requests.length === 0 && !cvError.value && (
						<div class="card empty">
							<p class="strong">Nenhum currículo gerado pelo site ainda</p>
							<p class="muted small">Em qualquer vaga, clique em “gerar currículo”. Ele fica pronto em até ~1 minuto.</p>
							<a class="btn btn-lime" href="/" onClick={onLinkClick}>
								ver vagas
							</a>
						</div>
					)}

					{pending.length > 0 && (
						<section class="stack-sm">
							<h2 class="label">em andamento_</h2>
							<ul class="stack-sm plain">{pending.map(renderItem)}</ul>
						</section>
					)}
					{done.length > 0 && (
						<section class="stack-sm">
							<h2 class="label">gerados_</h2>
							<ul class="stack-sm plain">{done.map(renderItem)}</ul>
						</section>
					)}
				</div>
			)
		}
	},
})
