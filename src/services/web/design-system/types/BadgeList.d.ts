/** Lista de badges que quebra linha (os itens são `<li className={badge()}>`). */
export interface BadgeListProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
}

export declare const BadgeList: React.ComponentType<BadgeListProps>
