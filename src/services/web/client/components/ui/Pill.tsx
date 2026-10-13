import type { ButtonHTMLAttributes } from 'react'

import { cx } from '../../lib/cx'
import { OUTLINED } from './outlined'

type PillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
	/** Liga/desliga (filtros, opções); sem ele a pill é uma ação comum (ex.: "mostrar mais"). */
	pressed?: boolean
	/** `row`: ocupa a linha, com o texto à esquerda. `dashed`: borda tracejada, para ações. */
	shape?: 'pill' | 'row' | 'dashed'
}

/** Opção em formato de cápsula, usada nos filtros e na modal de reportar. */
export function Pill({ pressed, shape = 'pill', className, ...props }: PillProps) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			{...props}
			className={cx('pill', OUTLINED, shape !== 'pill' && `pill-${shape}`, className)}
		/>
	)
}
