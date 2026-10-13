/** Seleção nativa com a mesma caixa do Input. */
export interface SelectProps {
	size?: 'sm' | 'md'
	invalid?: boolean
	/** Os <option>. */
	children: React.ReactNode
	name?: string
	value?: string
	defaultValue?: string
	disabled?: boolean
	onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void
	'aria-describedby'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Select: React.ComponentType<SelectProps>
