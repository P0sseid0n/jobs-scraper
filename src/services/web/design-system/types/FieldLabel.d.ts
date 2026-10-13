/** Nome do campo, acima dele; `htmlFor` é o `id` do campo. */
export interface FieldLabelProps {
	/** Obrigatório: o id do campo que o rótulo nomeia. */
	htmlFor: string
	children?: React.ReactNode
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const FieldLabel: React.ComponentType<FieldLabelProps>
