import { useState } from 'react'

import type { WebJob } from '../../api-types'
import { cvPdfUrl } from '../api'
import { requestCv, useCvFor } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'

/** Ação de currículo da vaga, conforme o último pedido: gerar → gerando… → baixar, ou tentar de novo se falhou. */
export function CvButton({ job, size = 'md' }: { job: Pick<WebJob, 'postId'>; size?: 'md' | 'lg' }) {
	const [sending, setSending] = useState(false)
	const cv = useCvFor(job.postId)

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
			<Button variant="lime" size={size} href={cvPdfUrl(cv.requestId, true)} download={cv.fileName ?? undefined}>
				<Icon name="download" />
				baixar currículo
			</Button>
		)
	}

	if (sending || cv?.status === 'pending') {
		return (
			<Button variant="lime" size={size} disabled aria-live="polite">
				<Icon name="spinner" />
				gerando…
			</Button>
		)
	}

	return (
		<Button variant="lime" size={size} onClick={generate} title={cv?.error ?? undefined}>
			<Icon name={cv?.status === 'failed' ? 'refresh' : 'file'} />
			{cv?.status === 'failed' ? 'tentar de novo' : 'gerar currículo'}
		</Button>
	)
}
