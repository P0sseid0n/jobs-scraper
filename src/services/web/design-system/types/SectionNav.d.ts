/**
 * Atalhos para as seções de uma tela longa, fixos abaixo do cabeçalho; marca a seção que está na tela. Cada seção leva
 * o `id` do atalho e a classe `SECTION_SCROLL_MARGIN`.
 */
export interface SectionNavProps {
	/** Fixa (fora do componente ou num `useMemo`). */
	sections: readonly { id: string; label: string }[]
	/** Nome da navegação para o leitor de tela (ex.: "Seções das configurações"). */
	label: string
	className?: string
}

export declare const SectionNav: React.ComponentType<SectionNavProps>
