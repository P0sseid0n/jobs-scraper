import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { cx, tv } from '../../lib/cx'
import { Icon } from '../Icon'

/** A caixa dos campos de texto e seleção; use `field()` em um contêiner que se comporta como campo (ex.: o de palavras-chave). */
export const field = tv({
	base: 'min-w-0 rounded-sm border border-line bg-surface text-ink',
	variants: {
		/** `sm`: nos filtros, ao lado do texto. `md`: nos formulários. */
		size: { sm: 'min-h-8 px-2 py-0 text-sm', md: 'min-h-11 px-3 py-0 text-sm' },
		invalid: { true: 'border-danger' },
	},
	defaultVariants: { size: 'md' },
})

/** Contorno de foco de um contêiner com um campo sem borda dentro (o mesmo do `:focus-visible` dos campos). */
export const FOCUS_WITHIN = 'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus'

type FieldLook = Omit<VariantProps<typeof field>, 'invalid'> & { invalid?: boolean }

export function Input({ size, invalid, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldLook) {
	return <input aria-invalid={invalid || undefined} {...props} className={field({ size, invalid, className })} />
}

export function Select({ size, invalid, className, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & FieldLook) {
	return (
		<select aria-invalid={invalid || undefined} {...props} className={field({ size, invalid, className: cx('pr-2', className) })} />
	)
}

/** Busca com a lupa dentro do campo; `label` é o nome para o leitor de tela. */
export function SearchInput({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
	return (
		<label className={field({ className: cx('flex items-center gap-2', FOCUS_WITHIN, className) })}>
			<Icon name="search" />
			<span className="sr-only">{label}</span>
			<input type="search" {...props} className="min-w-0 flex-1 border-0 bg-transparent outline-none" />
		</label>
	)
}

export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	return <input type="checkbox" {...props} className={cx('m-0 size-4.5 accent-ink', className)} />
}

export function Range({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	return <input type="range" {...props} className={cx('w-full accent-lime-accent', className)} />
}
