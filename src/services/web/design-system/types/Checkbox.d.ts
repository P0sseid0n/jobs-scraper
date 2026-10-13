/** Caixa de seleção nativa, na cor do texto. */
export interface CheckboxProps {
	checked?: boolean
	defaultChecked?: boolean
	name?: string
	value?: string
	disabled?: boolean
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const Checkbox: React.ComponentType<CheckboxProps>
