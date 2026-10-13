/** Campo de chips: digite e Enter (ou vírgula) para adicionar; Backspace no campo vazio remove o último. */
export interface KeywordInputProps {
	id: string
	/** As palavras (chips) atuais. */
	value: string[]
	/** Máximo de palavras. */
	max: number
	/** Máximo de caracteres por palavra (padrão 50). */
	maxLength?: number
	/** Mantém a grafia digitada;
  sem ele, tudo vira minúsculas. */
	keepCase?: boolean
	invalid?: boolean
	describedBy?: string
	onChange: (value: string[]) => void
}

export declare const KeywordInput: React.ComponentType<KeywordInputProps>
