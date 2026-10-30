/** Uma modal: abre ao montar, fecha com o Esc e com um clique no fundo escurecido; o `DialogTitle` de dentro dá o nome. */
export interface DialogProps {
	/** Chamado ao fechar por qualquer caminho (Esc, clique no fundo, o "x" do `DialogTitle` ou `ref.current.close()`). */
	onClose: () => void
	/** Para fechar de dentro (um "cancelar"): `ref.current?.close()`. */
	ref?: React.Ref<HTMLDialogElement>
	/** Enquanto algo está em andamento (ex.: enviando): nem o Esc, nem o clique no fundo, nem o "x" fecham. */
	locked?: boolean
	/** `false` num formulário longo, que um clique fora da caixa não deve fechar. */
	closeOnBackdrop?: boolean
	/** O id do título quando ele não é um `DialogTitle`. */
	labelledBy?: string
	/** A largura (`w-180`) e, numa modal com o meio rolando, `open:flex open:flex-col`. */
	className?: string
	children: React.ReactNode
}

export declare const Dialog: React.ComponentType<DialogProps>
