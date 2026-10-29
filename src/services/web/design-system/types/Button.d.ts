/** Botão com texto; com `href`, vira um link com a mesma cara. */
export interface ButtonProps {
	/** `lime`: ação principal da tela (uma por área). `ghost`: borda, sem preenchimento. */
	variant: 'lime' | 'ghost'
	size?: 'xs' | 'sm' | 'md' | 'lg'
	children?: React.ReactNode
	/** Com `href`, vira um <a> com a mesma cara. */
	href?: string
	/** Só com `href`: abre em outra aba e mostra o ícone de link externo. */
	external?: boolean
	/** `false`: sem o ícone de link externo, quando o botão já tem o seu. */
	externalIcon?: boolean
	type?: 'button' | 'submit' | 'reset'
	disabled?: boolean
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
	title?: string
	'aria-label'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Button: React.ComponentType<ButtonProps>
