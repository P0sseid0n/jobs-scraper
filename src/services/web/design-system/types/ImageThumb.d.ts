/**
 * Miniatura de imagem que amplia no clique: no hover (ou com o foco do teclado), a miniatura inteira cresce de leve,
 * com a moldura, e aparece o ícone de ampliar no canto. Quem a contém precisa de uns 4px de folga em volta.
 */
export interface ImageThumbProps {
	/** O que o clique faz, para o leitor de tela e a dica do mouse ("ampliar imagem 1 de 3 do post"). */
	label: string
	/** Abre a imagem grande (em geral, o `ImageViewer`). */
	onOpen: () => void
	/** Ainda não dá para ampliar: sem zoom nem clique. */
	disabled?: boolean
	/** Borda, raio e fundo da moldura (`rounded-md border border-line bg-surface-2`); o tamanho vem da imagem ou daqui. */
	className?: string
	style?: React.CSSProperties
	/** A imagem: um `<img>` ou o que for desenhado no lugar dela. */
	children: React.ReactNode
}

export declare const ImageThumb: React.ComponentType<ImageThumbProps>
