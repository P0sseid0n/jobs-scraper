import type { HTMLAttributes } from 'react'

import { cx } from '../../lib/cx'

/** Bloco no lugar do conteúdo que ainda está carregando, com um brilho passando (o tamanho e a cor vêm do `className`). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div {...props} className={cx('shimmer', className)} />
}
