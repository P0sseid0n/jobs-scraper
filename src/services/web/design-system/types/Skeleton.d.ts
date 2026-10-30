/** Bloco no lugar do conteúdo que ainda está carregando, com um brilho passando (o tamanho vem do `className`). */
export interface SkeletonProps {
	/**
	 * A forma, na cor das peças sobre o card (`bg-surface-2`): `line` (linha de texto), `pill` (selos e botões) ou
	 * `block` (um campo, uma área). Sem `shape`, a forma e a cor vêm do `className`.
	 */
	shape?: 'line' | 'pill' | 'block'
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}

export declare const Skeleton: React.ComponentType<SkeletonProps>
