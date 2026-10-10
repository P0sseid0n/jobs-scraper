import { defineComponent, ref } from 'vue'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { jobPath, navigate } from '../router'
import { dismissCv, requestCv, trayRequests } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'

const STATUS_TEXT: Record<WebCvRequest['status'], string> = {
	pending: 'gerando · até ~1 min',
	ready: 'pronto · PDF de 1 página',
	failed: 'falhou',
}

/** Indicador global dos currículos pedidos nesta sessão: o progresso não depende de ficar na mesma tela. */
export const CvTray = defineComponent({
	name: 'CvTray',
	setup() {
		const collapsed = ref(false)

		async function retry(request: WebCvRequest) {
			try {
				dismissCv(request.requestId)
				await requestCv(request)
			} catch (error) {
				notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
			}
		}

		return () => {
			const items = trayRequests.value
			if (items.length === 0) return null

			const pending = items.filter(item => item.status === 'pending').length

			return (
				<aside class="cv-tray" aria-label="Currículos em andamento">
					<button
						type="button"
						class="cv-tray-head mono"
						aria-expanded={!collapsed.value}
						onClick={() => (collapsed.value = !collapsed.value)}
					>
						<span>currículos_</span>
						<span>{pending ? `${pending} gerando` : `${items.length} ${items.length === 1 ? 'pronto' : 'prontos'}`}</span>
					</button>
					{!collapsed.value && (
						<ul class="cv-tray-list" role="status" aria-live="polite">
							{items.map(item => (
								<li key={item.requestId} class="cv-tray-item">
									<span class={['status-dot', `status-${item.status}`]} aria-hidden="true" />
									<div class="grow min-0">
										<a
											class="ellipsis cv-tray-title"
											href={jobPath(item.postId)}
											onClick={(event: MouseEvent) => {
												event.preventDefault()
												navigate(jobPath(item.postId))
											}}
										>
											{item.jobTitle ?? 'Vaga'}
										</a>
										<div class="mono xsmall tray-muted" title={item.error ?? undefined}>
											{item.status === 'failed' && item.error ? `falhou: ${item.error}` : STATUS_TEXT[item.status]}
										</div>
									</div>
									{item.status === 'ready' && (
										<a class="btn btn-tray" href={cvPdfUrl(item.requestId, true)} download={item.fileName ?? undefined}>
											baixar
										</a>
									)}
									{item.status === 'failed' && (
										<button type="button" class="btn btn-tray" onClick={() => retry(item)}>
											tentar de novo
										</button>
									)}
									{item.status !== 'pending' && (
										<button
											type="button"
											class="icon-btn tray-close"
											aria-label="Dispensar"
											onClick={() => dismissCv(item.requestId)}
										>
											<Icon name="close" size={14} />
										</button>
									)}
								</li>
							))}
						</ul>
					)}
				</aside>
			)
		}
	},
})
