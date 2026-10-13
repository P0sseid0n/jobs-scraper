/** Botão só com ícone (os ícones vêm em `children`). */
export interface IconButtonProps {
	/** Sem texto visível: vira o `aria-label` e a dica do mouse. */
	label: string
	size?: 'xs' | 'sm' | 'md'
	bordered?: boolean
	/** O ícone (ex.: <Icon name="close" />). */
	children: React.ReactNode
	type?: 'button' | 'submit' | 'reset'
	disabled?: boolean
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const IconButton: React.ComponentType<IconButtonProps>
