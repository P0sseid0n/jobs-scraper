import type { ReactNode } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'

const page = tv({
	base: 'mx-auto flex w-full max-w-340 flex-col gap-7 px-6 pt-11 pb-30 max-md:gap-5 max-md:px-4 max-md:pt-6 max-md:pb-35',
	variants: {
		/** `wide`: a lista de vagas e as coletas. `medium`: formulários e listas. `narrow`: uma coisa só (a vaga, o 404). */
		width: { wide: '', medium: 'max-w-270', narrow: 'max-w-190' },
	},
	defaultVariants: { width: 'wide' },
})

/** Conteúdo de uma tela, centralizado e com o espaçamento das margens. */
export function Page({ width, className, children }: VariantProps<typeof page> & { className?: string; children: ReactNode }) {
	return <div className={page({ width, className })}>{children}</div>
}

/** Abertura da tela: título grande (a parte em mono vem em `<Hero.Mono>`), texto de apoio e, à direita, `aside`. */
export function Hero({ title, lead, aside }: { title: ReactNode; lead: ReactNode; aside?: ReactNode }) {
	return (
		<section className="flex flex-wrap items-end justify-between gap-6">
			<div>
				<h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">{title}</h1>
				<p className="mt-3.5 max-w-130 text-sm text-pretty text-muted">{lead}</p>
			</div>
			{aside}
		</section>
	)
}

/** A parte do título em mono, sem negrito ("vagas de front-end, <Hero.Mono>coletadas.</Hero.Mono>"). */
Hero.Mono = function HeroMono({ children }: { children: ReactNode }) {
	return <span className="font-mono font-normal">{children}</span>
}
