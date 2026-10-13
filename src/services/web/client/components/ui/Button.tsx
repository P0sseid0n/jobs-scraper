import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'
import { OUTLINED } from './outlined'

const BASE =
	'inline-flex items-center justify-center gap-[7px] min-h-[38px] px-3.5 py-2 rounded-pill border border-transparent bg-transparent text-[13px] font-medium no-underline whitespace-nowrap transition-[background-color,border-color,opacity] duration-150 ease-[ease] disabled:opacity-60'

const SIZES = {
	xs: 'min-h-[30px] px-2.5 py-1 text-[12px]',
	md: '',
	lg: 'min-h-[46px] px-[18px] py-[11px] text-[14px]',
}

const VARIANTS = {
	lime: 'bg-lime text-lime-ink font-semibold not-disabled:hover:bg-lime-hover',
	ghost: cx('border-line text-ink', OUTLINED),
	tray: 'min-h-8 px-[11px] py-[5px] border-inv-line text-inv-ink text-[12px]',
}

type ButtonLook = {
	/** `lime`: ação principal da tela. `ghost`: borda, sem preenchimento. `tray`: na bandeja escura de currículos. */
	variant: keyof typeof VARIANTS
	size?: keyof typeof SIZES
	/** Classes do Tailwind que completam ou substituem as do botão (ex.: `self-start`, `hidden max-md:inline-flex`). */
	className?: string
}

type ButtonProps = ButtonLook &
	(({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>))

/** Botão com texto; com `href`, vira um link com a mesma cara. */
export function Button({ variant, size = 'md', className, ...props }: ButtonProps) {
	const classes = cx(BASE, SIZES[size], VARIANTS[variant], className)

	if (props.href !== undefined) return <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />
	return <button type="button" {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={classes} />
}
