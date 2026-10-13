import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'

import { tv } from '../../lib/cx'

const textLink = tv({
	base: 'text-ink underline underline-offset-3 hover:text-lime-text',
	variants: {
		// Como botão, fica alinhado à esquerda e com área de clique um pouco maior
		as: { a: '', button: 'self-start border-0 bg-transparent px-0 py-1.5' },
	},
})

type TextLinkProps = { className?: string } & (
	({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>) | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>)
)

/** Link sublinhado no meio do texto; sem `href`, vira um botão com a mesma cara (ex.: "mostrar post completo"). */
export function TextLink({ className, ...props }: TextLinkProps) {
	if (props.href !== undefined) {
		return <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={textLink({ as: 'a', className })} />
	}
	return (
		<button
			type="button"
			{...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
			className={textLink({ as: 'button', className })}
		/>
	)
}
