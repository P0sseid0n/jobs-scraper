/** Erro de validação do campo, no lugar da explicação. */
export interface FieldErrorProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}

export declare const FieldError: React.ComponentType<FieldErrorProps>
