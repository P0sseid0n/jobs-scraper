/** Cápsula pequena de texto (tecnologia, regime, status, contador); `tone` dá a cor. */
export interface BadgeProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
	tone?: 'plain' | 'neutral' | 'lime' | 'running' | 'ok' | 'danger' | 'muted'
	size?: 'xs' | 'sm' | 'md' | 'lg'
	bordered?: boolean | 'dashed'
}

export declare const Badge: React.ComponentType<BadgeProps>
