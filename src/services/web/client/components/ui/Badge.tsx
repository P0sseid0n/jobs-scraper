import type { HTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { cx, tv } from '../../lib/cx'

/**
 * Cápsula pequena de texto (tecnologia, regime, status, contador). Use `badge()` direto no `className` quando o
 * elemento não for um `<span>` (ex.: `<li className={badge()}>` numa lista, `<a className={badge(…)}>`).
 */
export const badge = tv({
	base: 'inline-flex items-center gap-1.5 rounded-pill font-mono whitespace-nowrap',
	variants: {
		tone: {
			/** Sem fundo: o texto e a borda (`bordered`) dão o contorno. */
			plain: '',
			neutral: 'bg-surface-2',
			lime: 'bg-lime text-lime-ink',
			running: 'bg-lime-soft text-lime-text',
			ok: 'bg-ok-bg',
			danger: 'bg-danger-bg text-danger',
			muted: 'bg-line',
		},
		size: {
			/** Contador sobre um ícone. */
			xs: 'px-1.5 py-px text-[10px]',
			sm: 'px-2 py-[3px] text-[10px]',
			md: 'px-[9px] py-[3px] text-[11.5px]',
			/** Com cara de botão (ex.: o status do scraper no cabeçalho). */
			lg: 'gap-2 px-3 py-[7px] text-[12px] no-underline',
		},
		/** Contorno na cor `--color-line` (troque com `border-*` no `className`). */
		bordered: { true: 'border border-line', dashed: 'border border-dashed border-line', false: '' },
	},
	defaultVariants: { tone: 'neutral', size: 'md', bordered: false },
})

export type BadgeTone = NonNullable<VariantProps<typeof badge>['tone']>

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>

export function Badge({ tone, size, bordered, className, ...props }: BadgeProps) {
	return <span {...props} className={badge({ tone, size, bordered, className })} />
}

/** Lista de badges que quebra linha (os itens são `<li className={badge()}>`). */
export function BadgeList({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
	return <ul {...props} className={cx('m-0 flex list-none flex-wrap gap-1.5 p-0', className)} />
}
