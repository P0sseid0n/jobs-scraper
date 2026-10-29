import { useEffect, useId, useRef, useState } from 'react'

import { jobShareSubject, jobShareText, type ShareJob } from '@shared/templates'

import { cx } from '../lib/cx'
import { notify } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field } from './ui/Input'

/** O compartilhamento nativo do sistema (celular e alguns desktops); sem ele, o botão nem aparece. */
const CAN_SHARE = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/**
 * Indicar a vaga a alguém: o texto montado com os dados públicos dela (nada do jobs-scraper nem da pessoa), editável,
 * e os jeitos de mandar: copiar, WhatsApp, e-mail e o compartilhar do sistema. Todos usam o texto como está no campo.
 */
export function ShareJobDialog({ job, onClose }: { job: ShareJob; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const textId = useId()
	const [text, setText] = useState(() => jobShareText(job))
	const empty = !text.trim()

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	async function share() {
		try {
			await navigator.share({ text })
		} catch (error) {
			// Fechar a folha do sistema sem escolher um app não é erro
			if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Não consegui abrir o compartilhamento', 'error')
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			// Aberta, vira coluna: o meio rola e o topo e o rodapé ficam à vista
			className={cx(DIALOG, 'w-140 open:flex open:flex-col')}
			aria-labelledby={titleId}
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="flex flex-col gap-1 border-b border-line px-5 pt-4 pb-3.5">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-bold" id={titleId}>
						Compartilhar vaga
					</h2>
					<IconButton label="Fechar" size="sm" onClick={() => ref.current?.close()}>
						<Icon name="close" size={16} />
					</IconButton>
				</div>
				<p className="m-0 min-w-0 truncate text-sm">
					<span className="font-semibold">{job.title}</span>
					{job.company && <span className="text-muted"> · {job.company}</span>}
				</p>
				<FieldHelp>
					Vão só os dados públicos da vaga e os links dela: quem recebe não precisa do jobs-scraper. Edite à vontade antes de
					mandar.
				</FieldHelp>
			</div>

			{/* Cada formato do compartilhamento é uma seção do meio (a imagem da vaga entra aqui, ao lado do texto) */}
			<div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-5 py-4">
				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor={textId}>texto</FieldLabel>
					<textarea
						id={textId}
						rows={10}
						value={text}
						onChange={event => setText(event.target.value)}
						className={field({ className: 'resize-y py-2.5 leading-relaxed' })}
					/>
					<FieldHelp className="text-xs">O *negrito* vira negrito no WhatsApp.</FieldHelp>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
				<Button variant="ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} external>
					WhatsApp
				</Button>
				<Button
					variant="ghost"
					href={`mailto:?subject=${encodeURIComponent(jobShareSubject(job))}&body=${encodeURIComponent(text)}`}
				>
					<Icon name="mail" size={14} />
					e-mail
				</Button>
				{CAN_SHARE && (
					<Button variant="ghost" disabled={empty} onClick={share}>
						<Icon name="share" size={14} />
						compartilhar
					</Button>
				)}
				<CopyButton variant="lime" text={text} what="Texto da vaga" label="copiar texto" disabled={empty} />
			</div>
		</dialog>
	)
}

/** "Compartilhar vaga", só o ícone (no topo do detalhe, ao lado do "reportar"): abre a modal com o texto da vaga. */
export function ShareJobButton({ job, className }: { job: ShareJob; className?: string }) {
	const [open, setOpen] = useState(false)

	return (
		<>
			<IconButton
				label="compartilhar vaga"
				size="sm"
				bordered
				className={className}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
			>
				<Icon name="share" size={15} />
			</IconButton>
			{open && <ShareJobDialog job={job} onClose={() => setOpen(false)} />}
		</>
	)
}
