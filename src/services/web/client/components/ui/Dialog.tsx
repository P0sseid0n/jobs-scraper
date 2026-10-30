import { createContext, use, useEffect, useId, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { Button } from './Button'
import { IconButton } from './IconButton'

/**
 * A caixa das modais (`<dialog>` nativo: foco preso, Esc fecha; o `m-auto` a centraliza, que o preflight zera). Ao
 * abrir, sobe crescendo com mola e o fundo escurece aos poucos.
 */
export const DIALOG =
	'm-auto w-120 rounded-lg border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-backdrop animate-dialog-in backdrop:animate-fade-in motion-reduce:animate-none motion-reduce:backdrop:animate-none'

/** O que o `DialogTitle` precisa da modal em volta: o id do título e como fechar. */
const DialogContext = createContext<{ titleId: string; close: () => void; locked: boolean } | null>(null)

type DialogProps = {
	/** Para fechar de dentro (um "cancelar", depois de salvar): `ref.current?.close()`, que chama o `onClose`. */
	ref?: Ref<HTMLDialogElement>
	/** Chamado ao fechar por qualquer caminho (Esc, clique no fundo, o "x" do `DialogTitle` ou `close()`). */
	onClose: () => void
	/** Enquanto algo está em andamento (ex.: enviando): nem o Esc, nem o clique no fundo, nem o "x" fecham. */
	locked?: boolean
	/** `false` num formulário longo, que um clique fora da caixa não deve fechar. */
	closeOnBackdrop?: boolean
	/** O id do título quando ele não é um `DialogTitle` (o do `Tutorial`, que tem o próprio cabeçalho). */
	labelledBy?: string
	/** A largura (`w-180`) e, numa modal com o meio rolando, `open:flex open:flex-col`. */
	className?: string
	children: ReactNode
}

/**
 * Uma modal: abre ao montar, fecha com o Esc e com um clique no fundo escurecido, e é nomeada pelo `DialogTitle` de
 * dentro dela. O conteúdo (o espaçamento, o meio que rola, o rodapé) é de cada modal.
 */
export function Dialog({ ref, onClose, locked = false, closeOnBackdrop = true, labelledBy, className, children }: DialogProps) {
	const dialog = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	// Montado, o `<dialog>` existe: quem passou o `ref` o recebe como num `ref` comum
	useImperativeHandle(ref, () => dialog.current as HTMLDialogElement, [])

	useEffect(() => {
		dialog.current?.showModal()
	}, [])

	const close = () => dialog.current?.close()

	return (
		<DialogContext value={{ titleId, close, locked }}>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog> */}
			<dialog
				ref={dialog}
				className={cx(DIALOG, className)}
				aria-labelledby={labelledBy ?? titleId}
				onClose={onClose}
				onCancel={event => locked && event.preventDefault()}
				// Clique no fundo escurecido (fora do conteúdo) fecha
				onClick={event => closeOnBackdrop && !locked && event.target === dialog.current && close()}
			>
				{children}
			</dialog>
		</DialogContext>
	)
}

/** O título da modal (o nome dela para o leitor de tela); com `closable`, o "x" de fechar fica à direita. */
export function DialogTitle({ closable = false, children }: { closable?: boolean; children: ReactNode }) {
	const context = use(DialogContext)
	if (!context) throw new Error('DialogTitle fora de um Dialog')

	const title = (
		<h2 className="text-lg font-bold" id={context.titleId}>
			{children}
		</h2>
	)
	if (!closable) return title

	return (
		<div className="flex items-center justify-between gap-3">
			{title}
			<IconButton label="Fechar" size="sm" disabled={context.locked} onClick={context.close}>
				<Icon name="close" size={16} />
			</IconButton>
		</div>
	)
}

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

	return (
		<Dialog ref={ref} onClose={onCancel}>
			<div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
				<DialogTitle>{title}</DialogTitle>
				{description && <p className="text-sm text-muted">{description}</p>}
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" onClick={() => ref.current?.close()}>
						{cancelLabel}
					</Button>
					<Button variant="danger" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</Dialog>
	)
}
