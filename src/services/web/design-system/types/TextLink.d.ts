/** Link sublinhado no meio do texto; sem `href`, vira um botão com a mesma cara (ex.: "mostrar post completo"). */
export interface TextLinkProps {
	children?: React.ReactNode
	/** Com `href` é um <a>;
  sem, vira um <button> com a mesma cara. */
	href?: string
	/** Só com `href`: abre em outra aba e mostra "↗" depois do texto. */
	external?: boolean
	type?: 'button' | 'submit' | 'reset'
	disabled?: boolean
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
	title?: string
	'aria-label'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const TextLink: React.ComponentType<TextLinkProps>
