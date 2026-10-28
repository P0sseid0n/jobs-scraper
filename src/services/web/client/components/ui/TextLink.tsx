import { createLink } from '@tanstack/react-router'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react'

import { tv } from '../../lib/cx'
import { NEW_TAB, NEW_TAB_NOTICE } from './link'

const textLink = tv({
	base: 'text-ink underline underline-offset-3 hover:text-lime-text',
	variants: {
		// Como botão, fica alinhado à esquerda e com área de clique um pouco maior; no toque, uma área invisível em volta
		// chega aos 44px de altura
		as: {
			a: '',
			button: [
				'relative self-start border-0 bg-transparent px-0 py-1.5',
				'pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2',
			],
		},
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
				{external && <span className="sr-only">{NEW_TAB_NOTICE}</span>}
			</a>
		)
	}
	return (
		<button type="button" {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} className={textLink({ as: 'button', className })}>
			{children}
		</button>
	)
}

function RouteAnchor({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> }) {
	return <a {...props} className={textLink({ as: 'a', className })} />
}

/** Link de texto para uma tela do site, com a rota tipada (`<RouteLink to="/configuracoes">`). */
export const RouteLink = createLink(RouteAnchor)
