/** Tela ou bloco sem conteúdo: nada encontrado, nada ainda ou falha ao carregar. */
export interface EmptyStateProps {
	title: React.ReactNode
	description?: React.ReactNode
	/** Botão que resolve (ex.: "limpar filtros", "tentar de novo"). */
	action?: React.ReactNode
	/** `error`: não deu para carregar; mostra o ícone de alerta e avisa o leitor de tela. */
	tone?: 'neutral' | 'error'
	/** Sem o card em volta, para quando já está dentro de um (ex.: o painel da vaga). */
	bare?: boolean
	className?: string
}

export declare const EmptyState: React.ComponentType<EmptyStateProps>
