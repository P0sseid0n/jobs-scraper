/** O título de uma `Dialog` (o nome dela para o leitor de tela); com `closable`, o "x" de fechar fica à direita. */
export interface DialogTitleProps {
	closable?: boolean
	children: React.ReactNode
}

export declare const DialogTitle: React.ComponentType<DialogTitleProps>
