import type { ButtonHTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { OUTLINED } from './outlined'
import { PRESS } from './press'

/** O estilo do botão, para um link com a mesma cara (ex.: `<a download className={iconButton({ size: "sm" })}>`). */
export const iconButton = tv({
	base: [
		'relative inline-grid place-items-center p-0 border-0 rounded-full bg-transparent',
		// Pequeno, afunda mais que o Button
		PRESS,
		'not-disabled:active:scale-85',
		// No toque, a área de clique tem 44px em qualquer tamanho: um quadrado invisível centralizado por cima do botão
		'pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-1/2',
	],
	variants: {
		size: { xs: 'size-6.5', sm: 'size-8', md: 'size-10' },
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
