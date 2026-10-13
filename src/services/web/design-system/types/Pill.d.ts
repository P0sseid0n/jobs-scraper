/** Opção em formato de cápsula, usada nos filtros e na modal de reportar. */
export interface PillProps {
	/** Liga/desliga (filtros, opções) via aria-pressed;
  sem ele a pill é uma ação comum. */
	pressed?: boolean
	/** `row`: ocupa a linha, texto à esquerda. `dashed`: borda tracejada, para ações. */
	shape?: 'pill' | 'row' | 'dashed'
	children?: React.ReactNode
	type?: 'button' | 'submit' | 'reset'
	disabled?: boolean
	onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
	title?: string
	'aria-label'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Pill: React.ComponentType<PillProps>
