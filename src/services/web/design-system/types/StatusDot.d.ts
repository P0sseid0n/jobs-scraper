/** Ponto colorido de status (8px), decorativo: o texto ao lado diz o status. */
export interface StatusDotProps {
	className?: string
	id?: string
	style?: React.CSSProperties
	children?: React.ReactNode
	tone?: 'lime' | 'ok' | 'danger' | 'muted' | 'current'
	glow?: boolean
	pulse?: boolean
}

export declare const StatusDot: React.ComponentType<StatusDotProps>
