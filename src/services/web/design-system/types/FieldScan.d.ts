/**
 * O padrão de carregamento dos campos: uma onda larga e desfocada, num tom perto do fundo e um pouco inclinada, atravessa
 * o campo de cima para baixo e de baixo para cima, como um scanner, enquanto o conteúdo dele não chega.
 */
export interface FieldScanProps {
	/** O que está acontecendo, escrito no centro do campo ("carregando a mensagem…"). */
	label: string
	/** Por cima do campo: `absolute inset-0` (num contêiner `relative`); no lugar dele: a altura (`min-h-40`) e o fundo. */
	className?: string
}

export declare const FieldScan: React.ComponentType<FieldScanProps>
