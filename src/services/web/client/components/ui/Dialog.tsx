import { useEffect, useId, useRef, type ReactNode } from 'react'

import { Button } from './Button'

/**
 * A caixa das modais (`<dialog>` nativo: foco preso, Esc fecha; o `m-auto` a centraliza, que o preflight zera). Ao
 * abrir, sobe crescendo com mola e o fundo escurece aos poucos.
 */
export const DIALOG =
	'm-auto w-120 rounded-lg border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-backdrop animate-dialog-in backdrop:animate-fade-in motion-reduce:animate-none motion-reduce:backdrop:animate-none'

/** Pergunta de sim ou não numa modal; fechar (Esc, clique fora ou o botão de cancelar) conta como cancelar. */
export function ConfirmDialog({
	title,
	description,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
}: {
	title: string
	description?: ReactNode
	confirmLabel: string
	cancelLabel: string
	onConfirm: () => void
	onCancel: () => void
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className={DIALOG}
			aria-labelledby={titleId}
			onClose={onCancel}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
				<h2 className="text-lg font-bold" id={titleId}>
					{title}
				</h2>
				{description && <p className="text-sm text-muted">{description}</p>}
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" onClick={() => ref.current?.close()}>
						{cancelLabel}
					</Button>
					<Button variant="lime" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</dialog>
	)
}
