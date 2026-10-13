import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

import { tv } from '../../lib/cx'
import { NEW_TAB } from './link'

const textLink = tv({
	base: 'text-ink underline underline-offset-3 hover:text-lime-text',
	variants: {
		// Como botão, fica alinhado à esquerda e com área de clique um pouco maior
		as: { a: '', button: 'self-start border-0 bg-transparent px-0 py-1.5' },
	},
})

type LinkProps = {
	href: string
	/** Abre em outra aba (sem dar acesso a esta página) e mostra "↗" depois do texto. */
	external?: boolean
} & AnchorHTMLAttributes<HTMLAnchorElement>

type TextLinkProps = { className?: string } & (
	LinkProps | ({ href?: never; external?: never } & ButtonHTMLAttributes<HTMLButtonElement>)
)

/** Link sublinhado no meio do texto; sem `href`, vira um botão com a mesma cara (ex.: "mostrar post completo"). */
export function TextLink({ className, external, children, ...props }: TextLinkProps) {
	if (props.href !== undefined) {
		return (
			<a {...(external ? NEW_TAB : {})} {...(props as LinkProps)} className={textLink({ as: 'a', className })}>
				{children}
				{external && <span aria-hidden="true"> ↗</span>}
			</a>
		)
	}
	return (
		<button type="button" {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={textLink({ as: 'button', className })}>
			{children}
		</button>
	)
}
