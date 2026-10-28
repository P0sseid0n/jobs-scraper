import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { cx, tv } from '../../lib/cx'
import { OUTLINED } from './outlined'
import { PRESS } from './press'

/** Use `pill()` direto no `className` quando a opção não for um botão (ex.: um `<label>` com checkbox). */
export const pill = tv({
	base: [
		// Na tela de toque, chega aos 44px de altura
		'inline-flex min-h-8.5 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-ink pointer-coarse:min-h-11',
		'aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg',
		// Atalho para a parte da tela onde se está (`aria-current`), como os do SectionNav: fica ligada do mesmo jeito
		'aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-bg',
		// Como `<label>` com checkbox, fica ligada do mesmo jeito quando ele está marcado
		'has-checked:border-ink has-checked:bg-ink has-checked:text-bg',
		// O foco do checkbox de dentro vai na pill inteira: o contorno dele sumiria sobre a pill ligada
		'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus **:focus-visible:outline-none',
		OUTLINED,
		PRESS,
	],
	variants: {
		/** `row`: ocupa a linha, com o texto à esquerda. `dashed`: borda tracejada, para ações. */
		shape: { pill: '', row: 'rounded-sm px-3 py-2.5 text-left text-sm', dashed: 'border-dashed' },
	},
	defaultVariants: { shape: 'pill' },
})

/** O número ao lado do texto de uma pill (quantas vagas há com o filtro). */
export const PILL_COUNT = 'font-mono text-xs opacity-70'

type PillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> &
	VariantProps<typeof pill> & {
		/** Liga/desliga (filtros, opções); sem ele a pill é uma ação comum (ex.: "mostrar mais"). */
		pressed?: boolean
	}

/** Opção em formato de cápsula, usada nos filtros e na modal de reportar. */
export function Pill({ pressed, shape, className, ...props }: PillProps) {
	return <button type="button" aria-pressed={pressed} {...props} className={pill({ shape, className })} />
}

/** Grupo de pills que quebra linha. */
export function PillGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div {...props} className={cx('flex flex-wrap gap-1.5', className)} />
}
