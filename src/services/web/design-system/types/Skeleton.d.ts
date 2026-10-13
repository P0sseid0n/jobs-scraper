/** Bloco pulsando no lugar do conteúdo que ainda está carregando (o tamanho e a cor vêm do `className`). */
export interface SkeletonProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}

export declare const Skeleton: React.ComponentType<SkeletonProps>
