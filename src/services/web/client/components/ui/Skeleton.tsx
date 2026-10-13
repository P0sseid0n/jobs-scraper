import type { HTMLAttributes } from 'react'

import { cx } from '../../lib/cx'

/** Bloco pulsando no lugar do conteúdo que ainda está carregando (o tamanho e a cor vêm do `className`). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div {...props} className={cx('animate-pulse motion-reduce:animate-none', className)} />
}
