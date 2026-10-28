/**
 * O padrão de carregamento dos campos: uma linha horizontal sobe e desce pelo campo, como um scanner, enquanto o
 * conteúdo dele não chega.
 */
export interface FieldScanProps {
	/** O que carrega, para o leitor de tela ("carregando a mensagem"). */
	label: string
	/** Por cima do campo: `absolute inset-0` (num contêiner `relative`); no lugar dele: a altura (`min-h-40`) e o fundo. */
	className?: string
}

export declare const FieldScan: React.ComponentType<FieldScanProps>
