import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { card } from './Card'

type DisclosureProps = {
	/** O que fica sempre à vista: o título do card ou o texto do link. */
	summary: ReactNode
	children: ReactNode
	/**
	 * `card`: uma seção inteira recolhida (card grande, título à esquerda e a seta à direita). `inline`: um detalhe dentro
	 * de um bloco ("ver o que o .tex precisa ter"), sublinhado como um link.
	 */
	variant?: 'card' | 'inline'
	defaultOpen?: boolean
	className?: string
}

/** Conteúdo que abre e fecha (`<details>` nativo, acessível pelo teclado); a seta gira quando aberto. */
export function Disclosure({ summary, children, variant = 'inline', defaultOpen, className }: DisclosureProps) {
	const isCard = variant === 'card'

	return (
		<details
			open={defaultOpen}
			// Fechado, o card não guarda o espaço do conteúdo (o `gap` só vale aberto)
			className={cx('group', isCard ? card({ size: 'lg', className: 'flex flex-col open:gap-5' }) : 'text-sm text-muted', className)}
		>
			<summary
				className={cx(
					'flex cursor-pointer list-none items-center',
					isCard ? 'justify-between gap-3' : 'w-fit gap-1.5 hover:text-ink',
				)}
			>
				{isCard ? summary : <span className="underline underline-offset-3">{summary}</span>}
				<Icon
					name="chevron"
					size={isCard ? 16 : 14}
					className="text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
				/>
			</summary>
			{isCard ? children : <div className="mt-1.5">{children}</div>}
		</details>
	)
}
