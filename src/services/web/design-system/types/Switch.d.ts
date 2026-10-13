/** Interruptor liga/desliga (checkbox nativo, acessível pelo teclado). */
export interface SwitchProps {
	checked: boolean
	/** Nome para o leitor de tela (o texto visível, se houver, fica num <label htmlFor>). */
	label: string
	id?: string
	disabled?: boolean
	onChange: (value: boolean) => void
}

export declare const Switch: React.ComponentType<SwitchProps>
