/** Interruptor com o texto ao lado (e uma explicação opcional abaixo do texto). */
export interface SwitchFieldProps {
	/** Liga o <label> ao interruptor. */
	id: string
	/** Texto ao lado do interruptor (também o nome acessível). */
	title: string
	/** Explicação menor abaixo do título. */
	description?: React.ReactNode
	checked: boolean
	disabled?: boolean
	onChange: (value: boolean) => void
}

export declare const SwitchField: React.ComponentType<SwitchFieldProps>
