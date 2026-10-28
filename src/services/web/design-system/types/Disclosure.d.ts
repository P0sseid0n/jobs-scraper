/** Conteúdo que abre e fecha (`<details>` nativo, acessível pelo teclado); a seta gira quando aberto. */
export interface DisclosureProps {
	/** O que fica sempre à vista: o título do card ou o texto do link. */
	summary: React.ReactNode
	children: React.ReactNode
	/** `card`: uma seção inteira recolhida. `inline` (padrão): um detalhe dentro de um bloco, sublinhado como um link. */
	variant?: 'card' | 'inline'
	defaultOpen?: boolean
	className?: string
}

export declare const Disclosure: React.ComponentType<DisclosureProps>
