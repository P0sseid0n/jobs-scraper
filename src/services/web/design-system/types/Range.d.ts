/** Controle deslizante nativo, no lime de destaque. */
export interface RangeProps {
	min?: number
	max?: number
	step?: number
	value?: number
	defaultValue?: number
	disabled?: boolean
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
	'aria-label'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Range: React.ComponentType<RangeProps>
