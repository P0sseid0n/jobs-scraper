/** Uma imagem do visualizador: o endereço e o texto alternativo. */
export interface ViewerImage {
	src: string
	alt: string
}

/**
 * Visualizador em tela cheia: fundo escuro, a imagem solta, setas e ← → (ou deslizar no toque) para trocar, o contador
 * e o link para o arquivo original. Esc, o botão de fechar ou um clique fora da imagem fecham. Abre ao montar.
 */
export interface ImageViewerProps {
	images: readonly ViewerImage[]
	/** A imagem que abre primeiro (padrão: 0). */
	start?: number
	/** O link "abrir original" (padrão: ligado); desligue quando o arquivo não existe fora da página (um PNG gerado). */
	original?: boolean
	onClose: () => void
}

export declare const ImageViewer: React.ComponentType<ImageViewerProps>
