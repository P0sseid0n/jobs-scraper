import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'

type SwitchProps = {
	checked: boolean
	/** Nome para o leitor de tela (o texto visível, se houver, fica num `<label htmlFor>`). */
	label: string
	id?: string
	disabled?: boolean
	onChange: (value: boolean) => void
}

/** Interruptor liga/desliga (checkbox nativo, acessível pelo teclado). */
export function Switch({ checked, label, id, disabled = false, onChange }: SwitchProps) {
	return (
		<input
			type="checkbox"
			role="switch"
			id={id}
			className={cx(
				'relative m-0 h-7 w-11 shrink-0 cursor-pointer appearance-none rounded-pill bg-control transition-colors disabled:opacity-50 checked:bg-ink dark:checked:bg-lime',
				// A bolinha corre com mola e, apertada, estica para o lado em que vai (a direita fica no lugar quando ligado)
				'after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-switch-knob after:transition-all after:duration-400 after:ease-spring',
				'not-disabled:active:after:w-6 not-disabled:active:after:duration-150 checked:after:translate-x-4 not-disabled:checked:active:after:translate-x-3',
				'checked:after:bg-lime dark:checked:after:bg-lime-ink',
			)}
			aria-checked={checked}
			aria-label={label}
			checked={checked}
			disabled={disabled}
			onChange={event => onChange(event.target.checked)}
		/>
	)
}

/** Interruptor com o texto ao lado (e uma explicação opcional abaixo do texto). */
export function SwitchField({
	id,
	title,
	description,
	...props
}: Omit<SwitchProps, 'label' | 'id'> & { id: string; title: string; description?: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<label htmlFor={id}>
				<span className="font-semibold">{title}</span>
				{description && <span className="block text-xs text-muted">{description}</span>}
			</label>
			<Switch id={id} label={title} {...props} />
		</div>
	)
}
