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
		// `aria-disabled`: desativado, mas ainda focável (o foco não se perde quando o botão desativa ao ser clicado); sem
		// o mouse, não afunda nem acende o hover
		'aria-disabled:pointer-events-none aria-disabled:opacity-40',
		// No toque, a área de clique tem 44px em qualquer tamanho: um quadrado invisível centralizado por cima do botão
		'pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-11 pointer-coarse:after:-translate-1/2',
	],
	variants: {
		/** `md` na altura do `Button` `md` (38px), para os dois ficarem alinhados lado a lado; `sm` também bate (32px). */
		size: { xs: 'size-6.5', sm: 'size-8', md: 'size-9.5' },
		/**
		 * A cor do ícone. Sem `tone`, a do texto em volta. `muted`: apagado, acende no hover (ações secundárias, como
		 * reordenar); `ink`: na cor do texto, mesmo ao lado de texto apagado; `danger`: vermelho fixo (algo bloqueado);
		 * `destructive`: apagado, fica vermelho no hover (remover, apagar).
		 */
		tone: {
			muted: 'text-muted hover:text-ink',
			ink: 'text-ink',
			danger: 'text-danger',
			destructive: 'text-muted hover:text-danger',
		},
		/**
		 * `bare` (padrão): sem borda, o hover escurece a cor do próprio texto e funciona em qualquer fundo (toast, bandeja
		 * escura). `ghost`: com a borda, como o `Button` `ghost`, para ações soltas (o tema no cabeçalho).
		 */
		variant: {
			bare: 'hover:bg-current/12',
			ghost: ['border border-line', OUTLINED],
		},
	},
	defaultVariants: { size: 'md', variant: 'bare' },
})

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> &
	VariantProps<typeof iconButton> & {
		/** Sem texto visível: vira o `aria-label` e a dica do mouse. */
		label: string
	}

/** Botão só com ícone (os ícones vêm em `children`). */
export function IconButton({ label, size, tone, variant, className, ...props }: IconButtonProps) {
	return (
		<button type="button" aria-label={label} title={label} {...props} className={iconButton({ size, tone, variant, className })} />
	)
}
