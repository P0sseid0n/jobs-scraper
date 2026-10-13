/** Explicação do campo, abaixo dele (ligue ao campo com `aria-describedby`). */
export interface FieldHelpProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}

export declare const FieldHelp: React.ComponentType<FieldHelpProps>
