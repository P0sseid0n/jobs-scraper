/** Uma variável do painel: o nome (sem as chaves), a descrição curta e o tipo. */
export interface VariablePickerItem {
	name: string
	description: string
	/** `link`: só funciona na mensagem; ganha a marca de link e fica desativada com `linkDisabled`. */
	type: 'text' | 'link'
	/** Pode faltar e ainda não tem fallback: ganha o ponto de alerta, explicado uma vez ("nem toda vaga tem") ao lado do grupo. */
	mayBeMissing?: boolean
	/** Uma dica abaixo da descrição (ex.: o fallback). */
	hint?: string
}

/** Painel "Variáveis disponíveis" de um editor de modelo: botões que inserem `{{nome}}` no último campo focado. */
export interface VariablePickerProps {
	/** Grupos ("da vaga", "do perfil", "suas"); grupo vazio não aparece. */
	groups: { label: string; variables: VariablePickerItem[] }[]
	onInsert: (name: string) => void
	/** O campo de destino é o assunto: as variáveis de link ficam desativadas ("só na mensagem"). */
	linkDisabled?: boolean
	/** O mini-tutorial do link "como funciona". */
	howTo?: React.ReactNode
	className?: string
}

export declare const VariablePicker: React.ComponentType<VariablePickerProps>
