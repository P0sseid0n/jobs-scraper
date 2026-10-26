import { useEffect, useRef, useState, type MouseEvent } from 'react'

import type { WebJob } from '../../api-types'
import { cvPdfUrl } from '../api'
import { celebrate } from '../lib/celebrate'
import { flyToTray } from '../lib/cv-flight'
import { cx } from '../lib/cx'
import { requestCv, useCvFor } from '../stores/cv'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'

/**
 * Ação de currículo da vaga, conforme o último pedido: gerar → gerando (com o anel girando) → baixar, ou tentar de novo
 * se falhou. A largura do botão é sempre a mesma; ficando pronto com a vaga na tela, vem uma comemoração discreta.
 */
export function CvButton({ job, size = 'md', className }: { job: Pick<WebJob, 'postId'>; size?: 'md' | 'lg'; className?: string }) {
	const [sending, setSending] = useState(false)
	const cv = useCvFor(job.postId)
	const slot = useRef<HTMLDivElement>(null)
	const lastStatus = useRef(cv?.status)

	// Ficou pronto com a vaga na tela (e não já pronto ao abrir): comemora quando o botão termina de se abrir
	useEffect(() => {
		const was = lastStatus.current
		lastStatus.current = cv?.status
		if (was !== 'pending' || cv?.status !== 'ready') return

		const timer = setTimeout(() => slot.current && celebrate(slot.current), 300)
		return () => clearTimeout(timer)
	}, [cv?.status])

	async function generate(event: MouseEvent<HTMLElement>) {
		// Medido no clique: o pedido aceito manda uma folhinha do botão até a bandeja
		const from = event.currentTarget.getBoundingClientRect()
		setSending(true)
		try {
			await requestCv(job)
			flyToTray(from)
		} catch (error) {
			notify(`Não consegui pedir o currículo: ${(error as Error).message}`, 'error')
		} finally {
			setSending(false)
		}
	}

	function render() {
		if (cv?.status === 'ready') {
			return (
				<Button
					variant="lime"
					size={size}
					className="w-full"
					href={cvPdfUrl(cv.requestId, true)}
					download={cv.fileName ?? undefined}
				>
					<Icon name="download" />
					baixar currículo
				</Button>
			)
		}

		if (sending || cv?.status === 'pending') {
			return (
				<Button
					variant="lime"
					size={size}
					// Desativado, mas sem apagar: é andamento, não bloqueio
					className="w-full disabled:opacity-100"
					disabled
					title="gerando o currículo · até ~1 min"
				>
					<span
						aria-hidden="true"
						className="size-4 rounded-full border-2 border-lime-ink/20 border-t-lime-ink animate-spin motion-reduce:animate-none"
					/>
					gerando…
				</Button>
			)
		}

		return (
			<Button variant="lime" size={size} className="w-full" onClick={generate} title={cv?.error ?? undefined}>
				<Icon name={cv?.status === 'failed' ? 'refresh' : 'file'} />
				{cv?.status === 'failed' ? 'tentar de novo' : 'gerar currículo'}
			</Button>
		)
	}

	return (
		<div ref={slot} className={cx('flex', className)} aria-live="polite">
			{render()}
		</div>
	)
}
