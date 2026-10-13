/** Busca com a lupa dentro do campo; `label` é o nome para o leitor de tela. */
export interface SearchInputProps {
	/** Nome para o leitor de tela (fica escondido;
  a lupa já aparece no campo). */
	label: string
	name?: string
	value?: string | number
	defaultValue?: string | number
	placeholder?: string
	disabled?: boolean
	required?: boolean
	readOnly?: boolean
	autoComplete?: string
	onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
	onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
	'aria-describedby'?: string
	className?: string
	id?: string
	style?: React.CSSProperties
}

export declare const SearchInput: React.ComponentType<SearchInputProps>
