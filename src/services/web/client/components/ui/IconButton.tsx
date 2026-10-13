import type { ButtonHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'
import { OUTLINED } from './outlined'

const SIZES = {
	xs: 'size-[26px]',
	sm: 'size-8',
	md: 'size-10',
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
	/** Sem texto visível: vira o `aria-label` e a dica do mouse. */
	label: string
	size?: keyof typeof SIZES
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
			className={cx(
				'inline-grid place-items-center p-0 border-0 rounded-[50%] bg-transparent',
				SIZES[size],
				// Sem borda, o hover escurece a cor do próprio texto: funciona em qualquer fundo (toast, bandeja escura)
				bordered ? cx('border border-line', OUTLINED) : 'hover:bg-current/12',
				className,
			)}
		/>
	)
}
