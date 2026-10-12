import { useState } from 'react'

import type { WebJob } from '../../api-types'
import { cvPdfUrl } from '../api'
import { cx } from '../lib/cx'
import { requestCv, useCvFor } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'

/** Ação de currículo da vaga, conforme o último pedido: gerar → gerando… → baixar, ou tentar de novo se falhou. */
export function CvButton({ job, size = 'sm' }: { job: Pick<WebJob, 'postId'>; size?: 'sm' | 'lg' }) {
	const [sending, setSending] = useState(false)
	const cv = useCvFor(job.postId)
	const className = cx('btn', size === 'lg' && 'btn-lg', 'btn-lime')

	async function generate() {
		setSending(true)
		try {
			await requestCv(job)
		} catch (error) {
			notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
		} finally {
			setSending(false)
		}
	}

	if (cv?.status === 'ready') {
		return (
			<a className={className} href={cvPdfUrl(cv.requestId, true)} download={cv.fileName ?? undefined}>
				<Icon name="download" />
				baixar currículo
			</a>
		)
	}

	if (sending || cv?.status === 'pending') {
		return (
			<button type="button" className={className} disabled aria-live="polite">
				<Icon name="spinner" />
				gerando…
			</button>
		)
	}

	return (
		<button type="button" className={className} onClick={generate} title={cv?.error ?? undefined}>
			<Icon name={cv?.status === 'failed' ? 'refresh' : 'file'} />
			{cv?.status === 'failed' ? 'tentar de novo' : 'gerar currículo'}
		</button>
	)
}
