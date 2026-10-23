/** Ícone de traço (24×24, na cor do texto), escolhido por `name`. */
export interface IconProps {
	name:
		| 'search'
		| 'mail'
		| 'external'
		| 'file'
		| 'copy'
		| 'check'
		| 'close'
		| 'download'
		| 'moon'
		| 'sun'
		| 'back'
		| 'first'
		| 'alert'
		| 'refresh'
		| 'briefcase'
		| 'settings'
		| 'filter'
		| 'trash'
		| 'plus'
		| 'flag'
		| 'spinner'
	size?: number
	className?: string
}

export declare const Icon: React.ComponentType<IconProps>
