import type { HTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'

const skeleton = tv({
	base: 'shimmer',
	variants: {
		/**
		 * A forma do que está carregando, na cor das peças sobre o card (`bg-surface-2`): `line` para uma linha de texto,
		 * `pill` para selos e botões, `block` para um campo ou uma área. Sem `shape`, a forma e a cor vêm do `className`
		 * (ex.: o próprio card carregando).
		 */
		shape: { line: 'rounded-xs bg-surface-2', pill: 'rounded-pill bg-surface-2', block: 'rounded-md bg-surface-2' },
	},
})

type SkeletonProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof skeleton>

/** Bloco no lugar do conteúdo que ainda está carregando, com um brilho passando (o tamanho vem do `className`). */
export function Skeleton({ shape, className, ...props }: SkeletonProps) {
	return <div {...props} className={skeleton({ shape, className })} />
}
