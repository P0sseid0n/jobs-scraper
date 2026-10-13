import type { HTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'

const statusDot = tv({
	base: 'inline-block size-2 shrink-0 rounded-full',
	variants: {
		tone: {
			ok: 'bg-ok-dot',
			lime: 'bg-lime',
			muted: 'bg-muted-dot',
			danger: 'bg-danger-dot',
			/** Na cor do texto (ex.: dentro de um `Badge` de erro) ou na que vier em `style.color`. */
			current: 'bg-current',
		},
		/** Halo em volta, para chamar atenção (vaga nova, coleta em andamento). */
		glow: { true: 'ring-3 ring-lime-glow' },
		/** Pulsando enquanto algo está em andamento. */
		pulse: { true: 'animate-pulse motion-reduce:animate-none' },
	},
	defaultVariants: { tone: 'current' },
})

export type StatusDotTone = NonNullable<VariantProps<typeof statusDot>['tone']>

type StatusDotProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof statusDot>

/** Ponto colorido de status (8px), decorativo: o texto ao lado diz o status. */
export function StatusDot({ tone, glow, pulse, className, ...props }: StatusDotProps) {
	return <span aria-hidden="true" {...props} className={statusDot({ tone, glow, pulse, className })} />
}
