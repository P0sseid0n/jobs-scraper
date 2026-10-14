/** Texto técnico para ler e copiar (o JSON da vaga, o erro de uma busca), em fonte mono e com as quebras de linha. */
export interface CodeBlockProps {
	/** O que é o texto, no topo do bloco (ex.: "documento no mongodb"). */
	label: string
	children: string
	/** Mostra o botão "copiar" (quem usa decide como copiar e avisar). */
	onCopy?: () => void
	/** Limita a altura e rola dentro do bloco, para textos longos como um JSON. */
	scroll?: boolean
	className?: string
}

export declare const CodeBlock: React.ComponentType<CodeBlockProps>
