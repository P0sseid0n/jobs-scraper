/** Campo de texto com sugestões, como um select com filtro: abre ao focar, filtra ao digitar e aceita qualquer texto. */
export interface ComboboxProps {
	id: string
	/** O texto do campo. */
	value: string
	/** As sugestões da lista. */
	options: readonly string[]
	placeholder?: string
	maxLength?: number
	invalid?: boolean
	describedBy?: string
	onChange: (value: string) => void
}

export declare const Combobox: React.ComponentType<ComboboxProps>
