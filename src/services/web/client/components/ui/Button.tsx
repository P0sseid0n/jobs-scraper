import { createLink } from '@tanstack/react-router'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, PointerEvent, Ref } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { Icon } from '../Icon'
import { useButtonMotion } from './button-motion'
import { NEW_TAB, NEW_TAB_NOTICE } from './link'
import { OUTLINED } from './outlined'
import { PRESS } from './press'

const button = tv({
	base: [
		'relative overflow-clip inline-flex items-center justify-center gap-2 min-h-9.5 px-3.5 py-2 rounded-pill border border-transparent bg-transparent text-sm font-medium no-underline whitespace-nowrap disabled:opacity-60',
		// Sobe um pouco no hover e afunda no clique
		PRESS,
		'not-disabled:hover:-translate-y-px not-disabled:active:translate-y-0',
	],
	variants: {
		/**
		 * `lime`: ação principal da tela; desabilitado, fica com a cara do `ghost` desabilitado, para não chamar para uma ação
		 * que não há. `ghost`: borda, sem preenchimento (numa superfície `inverted`, já sai clara).
		 */
		variant: {
			lime: [
				'bg-lime text-lime-ink font-semibold not-disabled:hover:bg-lime-hover not-disabled:hover:shadow-glow',
				'disabled:border-line disabled:bg-transparent disabled:text-muted',
			],
			ghost: ['border-line text-ink', OUTLINED],
		},
		size: {
			xs: 'min-h-7.5 px-2.5 py-1 text-xs',
			sm: 'min-h-8 px-3 py-1.5 text-xs',
			md: '',
			lg: 'min-h-11.5 px-4.5 py-3 text-sm',
		},
	},
	defaultVariants: { size: 'md' },
})

type ButtonLook = Required<Pick<VariantProps<typeof button>, 'variant'>> &
	Pick<VariantProps<typeof button>, 'size'> & {
		/** Classes do Tailwind que completam ou substituem as do botão (ex.: `self-start`, `hidden max-md:inline-flex`). */
		className?: string
	}

type LinkProps = {
	href: string
	/** Abre em outra aba (sem dar acesso a esta página) e mostra o ícone de link externo antes do texto. */
	external?: boolean
} & AnchorHTMLAttributes<HTMLAnchorElement>

type ButtonProps = ButtonLook & (LinkProps | ({ href?: never; external?: never } & ButtonHTMLAttributes<HTMLButtonElement>))

/** Botão com texto; com `href`, vira um link com a mesma cara. Quando o texto muda, a troca é animada. */
export function Button({ variant, size, className, external, children, ...props }: ButtonProps) {
	const classes = button({ variant, size, className })
	const motion = useButtonMotion<HTMLElement>(
		<>
			{external && <Icon name="external" size={size === 'lg' ? 16 : 14} />}
			{children}
			{external && <span className="sr-only">{NEW_TAB_NOTICE}</span>}
		</>,
		props.onPointerDown as ((event: PointerEvent<HTMLElement>) => void) | undefined,
	)

	if (props.href !== undefined) {
		return (
			<a
				{...(external ? NEW_TAB : {})}
				{...(props as LinkProps)}
				ref={motion.ref}
				onPointerDown={motion.onPointerDown}
				className={classes}
			>
				{motion.content}
			</a>
		)
	}
	return (
		<button
			type="button"
			{...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
			ref={motion.ref}
			onPointerDown={motion.onPointerDown}
			className={classes}
		>
			{motion.content}
		</button>
	)
}

function ButtonAnchor({
	variant,
	size,
	className,
	children,
	ref,
	...props
}: ButtonLook & AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> }) {
	const motion = useButtonMotion(children, props.onPointerDown, ref)
	return (
		<a {...props} ref={motion.ref} onPointerDown={motion.onPointerDown} className={button({ variant, size, className })}>
			{motion.content}
		</a>
	)
}

/** Botão que leva a uma tela do site, com a rota tipada (`<ButtonLink variant="lime" to="/coletas">`). */
export const ButtonLink = createLink(ButtonAnchor)
