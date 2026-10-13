import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'

/*
 * Botões com borda e sem preenchimento (Button `ghost`, IconButton `bordered`, Pill) levam a classe `outlined`, que dá
 * o mesmo hover a todos. Elementos fora destes componentes com esse visual (ex.: `check-pill`) usam a classe também.
 */

type ButtonLook = {
	/** `lime`: ação principal da tela. `ghost`: borda, sem preenchimento. `tray`: na bandeja escura de currículos. */
	variant: 'lime' | 'ghost' | 'tray'
	size?: 'xs' | 'md' | 'lg'
	className?: string
}

type ButtonProps = ButtonLook &
	(({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>))

/** Botão com texto; com `href`, vira um link com a mesma cara. */
export function Button({ variant, size = 'md', className, ...props }: ButtonProps) {
	const classes = cx('btn', `btn-${variant}`, variant === 'ghost' && 'outlined', size !== 'md' && `btn-${size}`, className)

	if (props.href !== undefined) return <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />
	return <button type="button" {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={classes} />
}
