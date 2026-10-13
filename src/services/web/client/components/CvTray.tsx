import { useState } from 'react'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { jobPath, navigate } from '../router'
import { dismissCv, requestCv, useTrayRequests } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { StatusDot, type StatusDotTone } from './ui/StatusDot'

const TRAY_DOTS: Record<WebCvRequest['status'], { tone: StatusDotTone; pulse?: boolean }> = {
	pending: { tone: 'lime', pulse: true },
	ready: { tone: 'ok' },
	failed: { tone: 'danger' },
}

const STATUS_TEXT: Record<WebCvRequest['status'], string> = {
	pending: 'gerando · até ~1 min',
	ready: 'pronto · PDF de 1 página',
	failed: 'falhou',
}

/** Indicador global dos currículos pedidos nesta sessão: o progresso não depende de ficar na mesma tela. */
export function CvTray() {
	const [collapsed, setCollapsed] = useState(false)
	const items = useTrayRequests()

	async function retry(request: WebCvRequest) {
		try {
			dismissCv(request.requestId)
			await requestCv(request)
		} catch (error) {
			notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
		}
	}

	if (items.length === 0) return null

	const pending = items.filter(item => item.status === 'pending').length

	return (
		<aside className="cv-tray" aria-label="Currículos em andamento">
			<button type="button" className="cv-tray-head mono" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
				<span>currículos_</span>
				<span>{pending ? `${pending} gerando` : `${items.length} ${items.length === 1 ? 'pronto' : 'prontos'}`}</span>
			</button>
			{!collapsed && (
				<ul className="cv-tray-list" role="status" aria-live="polite">
					{items.map(item => (
						<li key={item.requestId} className="cv-tray-item">
							<StatusDot {...TRAY_DOTS[item.status]} />
							<div className="grow min-0">
								<a
									className="ellipsis cv-tray-title"
									href={jobPath(item.postId)}
									onClick={event => {
										event.preventDefault()
										navigate(jobPath(item.postId))
									}}
								>
									{item.jobTitle ?? 'Vaga'}
								</a>
								<div className="mono xsmall tray-muted" title={item.error ?? undefined}>
									{item.status === 'failed' && item.error ? `falhou: ${item.error}` : STATUS_TEXT[item.status]}
								</div>
							</div>
							{item.status === 'ready' && (
								<Button variant="tray" href={cvPdfUrl(item.requestId, true)} download={item.fileName ?? undefined}>
									baixar
								</Button>
							)}
							{item.status === 'failed' && (
								<Button variant="tray" onClick={() => retry(item)}>
									tentar de novo
								</Button>
							)}
							{item.status !== 'pending' && (
								<IconButton label="Dispensar" size="sm" className="text-inv-muted" onClick={() => dismissCv(item.requestId)}>
									<Icon name="close" size={14} />
								</IconButton>
							)}
						</li>
					))}
				</ul>
			)}
		</aside>
	)
}
