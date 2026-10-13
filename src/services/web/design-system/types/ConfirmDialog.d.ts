/** Pergunta de sim ou não numa modal; fechar (Esc, clique fora ou o botão de cancelar) conta como cancelar. */
export interface ConfirmDialogProps {
	title: string
	description?: React.ReactNode
	confirmLabel: string
	cancelLabel: string
	onConfirm: () => void
	/** Também chamado no Esc e no clique fora. */
	onCancel: () => void
}

export declare const ConfirmDialog: React.ComponentType<ConfirmDialogProps>
