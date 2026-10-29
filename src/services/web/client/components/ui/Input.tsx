import type { ComponentProps, CSSProperties, InputHTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { cx, tv } from '../../lib/cx'
import { Icon } from '../Icon'

/** A caixa dos campos de texto e seleção (o botão do `SelectMenu`); use `field()` em um contêiner que se comporta como campo (ex.: o de palavras-chave). */
export const field = tv({
	// Desativado, o campo fica com o fundo e o texto apagados para não parecer editável
	base: 'min-w-0 rounded-sm border border-line bg-surface text-ink disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
	variants: {
		/** `sm`: nos filtros, ao lado do texto. `md`: nos formulários. */
		size: { sm: 'min-h-8 px-2 py-0 text-sm', md: 'min-h-11 px-3 py-0 text-sm' },
		invalid: { true: 'border-danger' },
		/** Num `<textarea>`: o texto com respiro, e a pessoa pode puxar a altura. */
		multiline: { true: 'resize-y py-2.5 leading-relaxed' },
		/** Num `<textarea>` de mensagem: cresce com o texto, até um limite (depois rola). */
		grow: { true: 'field-sizing-content min-h-44 max-h-80' },
	},
	defaultVariants: { size: 'md' },
})

/** Contorno de foco de um contêiner com um campo sem borda dentro (o mesmo do `:focus-visible` dos campos). */
export const FOCUS_WITHIN = 'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus'

export type FieldLook = Omit<VariantProps<typeof field>, 'invalid' | 'multiline' | 'grow'> & { invalid?: boolean }

export function Input({ size, invalid, className, ...props }: Omit<ComponentProps<'input'>, 'size'> & FieldLook) {
	return <input aria-invalid={invalid || undefined} {...props} className={field({ size, invalid, className })} />
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

/** Caixa de seleção: vazia com a borda da linha; marcada, preenchida como o `Switch` ligado (ink, ou lime no escuro). */
export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	return (
		<span className="relative inline-grid shrink-0 place-items-center">
			<input
				type="checkbox"
				{...props}
				className={cx(
					'peer m-0 size-4.5 cursor-pointer appearance-none rounded-xs border border-control bg-surface transition',
					'duration-300 ease-spring not-disabled:hover:border-ink not-disabled:active:scale-90 not-disabled:active:duration-75',
					'checked:border-ink checked:bg-ink dark:checked:border-lime dark:checked:bg-lime',
					'disabled:cursor-not-allowed disabled:opacity-50',
					className,
				)}
			/>
			{/* O "check" por cima da caixa; o clique passa para o input */}
			<Icon
				name="check"
				size={14}
				// Marcado, o "check" cresce com mola em vez de só aparecer
				className="pointer-events-none absolute scale-0 -rotate-45 stroke-3 text-lime opacity-0 transition duration-300 ease-spring peer-checked:scale-100 peer-checked:rotate-0 peer-checked:opacity-100 dark:text-lime-ink"
			/>
		</span>
	)
}

const RANGE = [
	'm-0 h-5 w-full not-disabled:cursor-grab not-disabled:active:cursor-grabbing appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
	'range-track:h-1.5 range-track:rounded-pill range-track:bg-range-fill',
	// A bolinha (20px) sobe metade da diferença para o trilho (6px): 7px
	'range-thumb:box-border range-thumb:size-5 webkit-range-thumb:-mt-1.75 range-thumb:appearance-none range-thumb:rounded-full range-thumb:border-2 range-thumb:border-ink dark:range-thumb:border-lime range-thumb:bg-surface range-thumb:shadow-sm range-thumb:transition range-thumb:duration-300 range-thumb:ease-spring',
	// A mão de arrastar (fechada ao segurar) também na bolinha, não só no trilho
	'not-disabled:range-thumb:cursor-grab not-disabled:active:range-thumb:cursor-grabbing disabled:range-thumb:cursor-not-allowed',
	'not-disabled:hover:range-thumb:scale-110 not-disabled:active:range-thumb:scale-115 not-disabled:active:range-thumb:bg-lime',
	// O contorno de foco vai na bolinha, não na caixa toda do campo
	'focus-visible:range-thumb:outline-2 focus-visible:range-thumb:outline-offset-2 focus-visible:range-thumb:outline-focus',
].join(' ')

/** Quanto do trilho fica preenchido para o valor (`50%` no meio entre `min` e `max`). */
const rangeFill = (value: number, min: number, max: number) => `${((value - min) / (max - min || 1)) * 100}%`

/** Controle deslizante: o trilho fica em lime até o valor e a bolinha cresce ao arrastar. */
export function Range({
	className,
	style,
	min = 0,
	max = 100,
	onInput,
	...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
	const [low, high] = [Number(min), Number(max)]
	// Sem valor, o navegador começa no meio
	const value = Number(props.value ?? props.defaultValue ?? (low + high) / 2)

	return (
		<input
			type="range"
			min={min}
			max={max}
			{...props}
			style={{ '--range-fill': rangeFill(value, low, high), ...style } as CSSProperties}
			// Sem `value` controlado (ex.: com `defaultValue`), o preenchimento acompanha direto no elemento
			onInput={event => {
				event.currentTarget.style.setProperty('--range-fill', rangeFill(event.currentTarget.valueAsNumber, low, high))
				onInput?.(event)
			}}
			className={cx(RANGE, className)}
		/>
	)
}
