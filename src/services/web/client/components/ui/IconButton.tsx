import type { ButtonHTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { OUTLINED } from './outlined'

const iconButton = tv({
	base: 'inline-grid place-items-center p-0 border-0 rounded-[50%] bg-transparent',
	variants: {
		size: { xs: 'size-[26px]', sm: 'size-8', md: 'size-10' },
		bordered: {
			true: ['border border-line', OUTLINED],
			// Sem borda, o hover escurece a cor do próprio texto: funciona em qualquer fundo (toast, bandeja escura)
			false: 'hover:bg-current/12',
		},
	},
	defaultVariants: { size: 'md', bordered: false },
})

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> &
	VariantProps<typeof iconButton> & {
		/** Sem texto visível: vira o `aria-label` e a dica do mouse. */
		label: string
	}

/** Botão só com ícone (os ícones vêm em `children`). */
export function IconButton({ label, size, bordered, className, ...props }: IconButtonProps) {
	return <button type="button" aria-label={label} title={label} {...props} className={iconButton({ size, bordered, className })} />
}
