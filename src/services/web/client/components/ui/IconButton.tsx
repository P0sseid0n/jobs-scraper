import type { ButtonHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
	/** Sem texto visível: vira o `aria-label` e a dica do mouse. */
	label: string
	size?: 'sm' | 'md'
	bordered?: boolean
}

/** Botão só com ícone (os ícones vêm em `children`). */
export function IconButton({ label, size = 'md', bordered = false, className, ...props }: IconButtonProps) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			{...props}
			className={cx('icon-btn', size === 'sm' && 'icon-btn-sm', bordered && 'bordered outlined', className)}
		/>
	)
}
