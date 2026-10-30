/** Uma linha com o andamento ou o resultado de algo ("Validando no cv-updater…"), anunciada ao leitor de tela. */
export interface StatusLineProps {
	/** Normalmente `check` (pronto) ou `spinner` (em andamento). */
	icon: IconProps['name']
	/** Sem `tone`, na cor do texto. `ok`: deu certo; `muted`: esperando algo de fundo. */
	tone?: 'ok' | 'muted'
	/** `false` dentro de outro `role="status"`, para não ser anunciada duas vezes. */
	live?: boolean
	className?: string
	children: React.ReactNode
}

export declare const StatusLine: React.ComponentType<StatusLineProps>
