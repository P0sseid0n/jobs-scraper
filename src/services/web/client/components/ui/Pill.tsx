import type { ButtonHTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { OUTLINED } from './outlined'

// As classes `pill*` ainda são do styles.css (migram na fase 3 da padronização)
const pill = tv({
	base: ['pill', OUTLINED],
	variants: {
		/** `row`: ocupa a linha, com o texto à esquerda. `dashed`: borda tracejada, para ações. */
		shape: { pill: '', row: 'pill-row', dashed: 'pill-dashed' },
	},
	defaultVariants: { shape: 'pill' },
})

type PillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> &
	VariantProps<typeof pill> & {
		/** Liga/desliga (filtros, opções); sem ele a pill é uma ação comum (ex.: "mostrar mais"). */
		pressed?: boolean
	}

/** Opção em formato de cápsula, usada nos filtros e na modal de reportar. */
export function Pill({ pressed, shape, className, ...props }: PillProps) {
	return <button type="button" aria-pressed={pressed} {...props} className={pill({ shape, className })} />
}
