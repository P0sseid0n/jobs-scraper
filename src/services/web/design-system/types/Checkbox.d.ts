/** Caixa de seleção: vazia com a borda da linha; marcada, preenchida como o `Switch` ligado (ink, ou lime no escuro). */
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
