import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { cx } from '../lib/cx'
import { jobParams } from '../router'
import { dismissCv, requestCv, useTrayRequests } from '../stores/cv'
import { jobsStore } from '../stores/jobs'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { DrawnCheck, Icon } from './Icon'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { StatusDot, type StatusDotTone } from './ui/StatusDot'
import { LIST, META } from './ui/text'

const TRAY_DOTS: Record<WebCvRequest['status'], { tone: StatusDotTone; pulse?: boolean }> = {
	pending: { tone: 'lime', pulse: true },
	ready: { tone: 'ok' },
	failed: { tone: 'danger' },
}

/** Indicador global dos currículos pedidos nesta sessão: o progresso não depende de ficar na mesma tela. */
export function CvTray() {
	const t = useT().cvTray
	const [collapsed, setCollapsed] = useState(false)
	const items = useTrayRequests()

	async function retry(request: WebCvRequest) {
		try {
			dismissCv(request.requestId)
			await requestCv(request)
		} catch (error) {
			notify(t.requestFailed((error as Error).message), 'error')
		}
	}

	if (items.length === 0) return null

	const pending = items.filter(item => item.status === 'pending').length

	return (
		<aside
			// O currículo pedido voa até aqui (`lib/cv-flight.ts`)
			data-cv-tray
			className="fixed right-5 bottom-5 left-4 z-30 ml-auto max-w-90 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-float animate-toast-in motion-reduce:animate-none with-save-bar:bottom-23 max-md:right-4 max-md:bottom-safe-19 max-md:with-save-bar:bottom-safe-38"
			aria-label={t.label}
		>
			<button
				type="button"
				className={cx(META, 'flex w-full justify-between border-0 bg-transparent py-1')}
				aria-expanded={!collapsed}
				onClick={() => setCollapsed(!collapsed)}
			>
				<span>{t.title}</span>
				<span>{pending ? t.generating(pending) : t.ready(items.length)}</span>
			</button>
			{!collapsed && (
				<ul
					className={cx(
						LIST,
						'mt-2 flex max-h-half-screen flex-col gap-2.5 overflow-y-auto animate-panel-in motion-reduce:animate-none',
					)}
					role="status"
					aria-live="polite"
				>
					{items.map(item => (
						<li key={item.requestId} className="flex items-center gap-2.5">
							{/* Pronto, o ponto pulsando vira um check desenhado */}
							{item.status === 'ready' ? (
								<DrawnCheck size={14} className="-mx-0.5 text-ok" />
							) : (
								<StatusDot {...TRAY_DOTS[item.status]} />
							)}
							<div className="grow min-w-0">
								<Link
									className="block truncate text-sm no-underline"
									to="/jobs/$id"
									params={jobParams(item.postId)}
									search={() => jobsStore.get().filters}
								>
									{item.jobTitle ?? t.job}
								</Link>
								<div className={cx(META, 'truncate')} title={item.error ?? undefined}>
									{item.status === 'failed' && item.error ? t.failed(item.error) : t.status[item.status]}
								</div>
							</div>
							{item.status === 'ready' && (
								<Button variant="ghost" size="sm" href={cvPdfUrl(item.requestId, true)} download={item.fileName ?? undefined}>
									{t.download}
								</Button>
							)}
							{item.status === 'failed' && (
								<Button variant="ghost" size="sm" onClick={() => retry(item)}>
									{t.retry}
								</Button>
							)}
							{item.status !== 'pending' && (
								<IconButton label={t.dismiss} size="sm" className="text-muted" onClick={() => dismissCv(item.requestId)}>
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
