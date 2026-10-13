/** Conteúdo de uma tela, centralizado e com o espaçamento das margens. */
export interface PageProps {
	width?: 'wide' | 'medium' | 'narrow'
	className?: string
	children: React.ReactNode
}

export declare const Page: React.ComponentType<PageProps>
