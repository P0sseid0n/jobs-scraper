/**
 * Abas sublinhadas (o padrão de abas do WAI-ARIA): setas, Home e End trocam de aba, e o Tab vai direto para o painel.
 * O conteúdo de cada aba vai num `TabPanel` com o mesmo `id`.
 */
export interface TabsProps {
	/** Prefixo dos ids das abas e dos painéis; o mesmo `tabsId` dos `TabPanel`. */
	id: string
	/** Nome da lista para o leitor de tela (ex.: "Contas"). */
	label: string
	items: { value: string; label: React.ReactNode }[]
	/** O `value` da aba escolhida. */
	selected: string
	onSelect: (value: string) => void
	className?: string
}

export declare const Tabs: React.ComponentType<TabsProps>

/** O conteúdo de uma aba. Fora da aba escolhida fica só escondido (não desmonta), e o que foi digitado nele continua. */
export interface TabPanelProps {
	/** O `id` do `Tabs`. */
	tabsId: string
	value: string
	selected: boolean
	className?: string
	children?: React.ReactNode
}

export declare const TabPanel: React.ComponentType<TabPanelProps>
