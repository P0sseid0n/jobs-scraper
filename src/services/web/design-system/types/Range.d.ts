/** Controle deslizante: o trilho fica em lime até o valor e a bolinha cresce ao arrastar. */
export interface RangeProps {
	min?: number
	max?: number
	step?: number
	value?: number
	defaultValue?: number
	disabled?: boolean
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
	'aria-label'?: string
	/** O valor anunciado pelo leitor de tela, com a unidade ("70%"). */
	'aria-valuetext'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Range: React.ComponentType<RangeProps>
