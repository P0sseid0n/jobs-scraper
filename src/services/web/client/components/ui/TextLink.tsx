import { createLink } from '@tanstack/react-router'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react'
import type { VariantProps } from 'tailwind-variants'

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
		/** Sem `size`, o tamanho do texto em volta; `sm` e `xs` para o link solto, fora de um parágrafo. */
		size: { sm: 'text-sm', xs: 'text-xs' },
		/** Em mono, como os metadados (`META`) ao lado: ações de rodapé e de metadados ("ver post com a lista", "desmarcar"). */
		mono: { true: 'font-mono' },
	},
})

type LinkProps = {
	href: string
	/** Abre em outra aba (sem dar acesso a esta página) e mostra "↗" depois do texto. */
	external?: boolean
} & AnchorHTMLAttributes<HTMLAnchorElement>

type TextLinkProps = { className?: string } & Pick<VariantProps<typeof textLink>, 'size' | 'mono'> &
	(LinkProps | ({ href?: never; external?: never } & ButtonHTMLAttributes<HTMLButtonElement>))

/** Link sublinhado no meio do texto; sem `href`, vira um botão com a mesma cara (ex.: "mostrar post completo"). */
export function TextLink({ className, size, mono, external, children, ...props }: TextLinkProps) {
	if (props.href !== undefined) {
		return (
			<a {...(external ? NEW_TAB : {})} {...(props as LinkProps)} className={textLink({ as: 'a', size, mono, className })}>
				{children}
				{external && <span aria-hidden="true"> ↗</span>}
				{external && <span className="sr-only">{NEW_TAB_NOTICE}</span>}
			</a>
		)
	}
	return (
		<button
			type="button"
			{...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
			className={textLink({ as: 'button', size, mono, className })}
		>
			{children}
		</button>
	)
}

function RouteAnchor({
	className,
	size,
	mono,
	...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & Pick<VariantProps<typeof textLink>, 'size' | 'mono'> & { ref?: Ref<HTMLAnchorElement> }) {
	return <a {...props} className={textLink({ as: 'a', size, mono, className })} />
}

/** Link de texto para uma tela do site, com a rota tipada (`<RouteLink to="/configuracoes">`). */
export const RouteLink = createLink(RouteAnchor)
