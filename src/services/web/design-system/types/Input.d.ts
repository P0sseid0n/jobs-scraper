/** Campo de texto; `size="sm"` nos filtros, `md` nos formulários. */
export interface InputProps {
	size?: 'sm' | 'md'
	/** Borda vermelha e aria-invalid. */
	invalid?: boolean
	type?: string
	min?: number | string
	max?: number | string
	step?: number | string
	maxLength?: number
	name?: string
	value?: string | number
	defaultValue?: string | number
	placeholder?: string
	disabled?: boolean
	required?: boolean
	readOnly?: boolean
	autoComplete?: string
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
	onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
	'aria-describedby'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Input: React.ComponentType<InputProps>
