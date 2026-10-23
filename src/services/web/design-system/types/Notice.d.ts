/** Aviso dentro da tela (dados duvidosos, falha de uma parte); erros que pedem ação usam `role="alert"`. */
export interface NoticeProps {
	tone: 'danger' | 'warn'
	size?: 'md' | 'lg'
	icon?:
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
	className?: string
	children: React.ReactNode
}

export declare const Notice: React.ComponentType<NoticeProps>
