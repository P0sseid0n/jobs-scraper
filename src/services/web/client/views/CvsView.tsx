import { useEffect } from 'react'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { Icon } from '../components/Icon'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { jobPath, onLinkClick } from '../router'
import { loadCvRequests, requestCv, useCvRequests } from '../stores/cv'
import { notify } from '../stores/toast'

async function retry(request: WebCvRequest) {
	try {
		await requestCv(request)
	} catch (error) {
		notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
	}
}

function CvItem({ request }: { request: WebCvRequest }) {
	const meta = [request.company, formatDateTime(request.finishedAt ?? request.requestedAt)].filter(Boolean).join(' · ')

	return (
		<li className={cx('card cv-row', `cv-${request.status}`)}>
			<span className={cx('pdf-icon mono', request.status === 'pending' && 'dashed')} aria-hidden="true">
				{request.status === 'pending' ? <Icon name="spinner" size={14} /> : request.status === 'failed' ? 'erro' : 'PDF'}
			</span>
			<div className="grow min-0 stack-xxs">
				<a className="strong ellipsis" href={jobPath(request.postId)} onClick={onLinkClick}>
					{request.jobTitle ?? 'Vaga'}
				</a>
				<span className="mono muted xsmall">
					{request.status === 'pending' ? `gerando · pedido ${formatDateTime(request.requestedAt)}` : meta}
				</span>
				{request.status === 'failed' && <span className="small danger-text">{request.error}</span>}
			</div>
			{request.status === 'ready' && (
				<div className="row-actions">
					<Button variant="ghost" href={cvPdfUrl(request.requestId)} target="_blank" rel="noopener">
						abrir
					</Button>
					<Button variant="lime" href={cvPdfUrl(request.requestId, true)} download={request.fileName ?? undefined}>
						<Icon name="download" size={14} />
						baixar
					</Button>
				</div>
			)}
			{request.status === 'failed' && (
				<Button variant="ghost" onClick={() => retry(request)}>
					tentar de novo
				</Button>
			)}
		</li>
	)
}

/** "Meus currículos": os PDFs gerados pelo site, para baixar de novo sem gerar outro. */
export function CvsView() {
	const { requests, error, loaded } = useCvRequests()

	useEffect(() => {
		void loadCvRequests()
	}, [])

	const pending = requests.filter(request => request.status === 'pending')
	const done = requests.filter(request => request.status !== 'pending')

	return (
		<div className="page page-medium">
			<section className="hero">
				<div>
					<h1 className="display">
						meus <span className="mono display-mono">currículos.</span>
					</h1>
					<p className="muted lead">
						Um PDF de uma página por vaga: apresentação reescrita para a vaga, tecnologias pedidas nas habilidades, projetos do
						GitHub mais relevantes e a experiência reordenada.
					</p>
				</div>
			</section>

			{error && (
				<EmptyState
					tone="error"
					title="Não consegui carregar os currículos"
					description={error}
					action={
						<Button variant="lime" onClick={() => loadCvRequests()}>
							tentar de novo
						</Button>
					}
				/>
			)}

			{loaded && requests.length === 0 && !error && (
				<EmptyState
					title="Nenhum currículo gerado pelo site ainda"
					description="Em qualquer vaga, clique em “gerar currículo”. Ele fica pronto em até ~1 minuto."
					action={
						<Button variant="lime" href="/" onClick={onLinkClick}>
							ver vagas
						</Button>
					}
				/>
			)}

			{pending.length > 0 && (
				<section className="stack-sm">
					<h2 className="label">em andamento_</h2>
					<ul className="stack-sm plain">
						{pending.map(request => (
							<CvItem key={request.requestId} request={request} />
						))}
					</ul>
				</section>
			)}
			{done.length > 0 && (
				<section className="stack-sm">
					<h2 className="label">gerados_</h2>
					<ul className="stack-sm plain">
						{done.map(request => (
							<CvItem key={request.requestId} request={request} />
						))}
					</ul>
				</section>
			)}
		</div>
	)
}
