import { useEffect, useState, type ReactNode } from 'react'

import { cx } from '../lib/cx'

/**
 * As peças das demonstrações animadas (a da abertura do onboarding e as cenas dos tutoriais das contas). Todas usam
 * animações com `both` e atraso em `stagger-*`; com movimento reduzido, mostram direto o estado final.
 */

/**
 * O que está em andamento e, depois, o resultado, no mesmo lugar: o primeiro sai por cima e o segundo sobe de baixo,
 * como a troca de texto dos botões. Com movimento reduzido, só o resultado.
 */
export function Swap({
	working,
	done,
	outDelay,
	inDelay,
}: {
	working: ReactNode
	done: ReactNode
	outDelay: string
	inDelay: string
}) {
	return (
		<span className="grid">
			<span className={cx('col-start-1 row-start-1 flex items-center gap-1.5 animate-text-out motion-reduce:hidden', outDelay)}>
				{working}
			</span>
			<span className={cx('col-start-1 row-start-1 flex items-center gap-1.5 animate-text-in motion-reduce:animate-none', inDelay)}>
				{done}
			</span>
		</span>
	)
}

/**
 * A seta do mouse, que chega, clica e some (sem movimento, não aparece). `className` dá a posição (a ponta da seta fica
 * no canto de cima à esquerda) e o atraso (`stagger-*`), num pai `relative`.
 */
export function Cursor({ className }: { className: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className={cx('pointer-events-none absolute size-5 origin-top-left animate-cursor-click motion-reduce:hidden', className)}
		>
			<path d="M5 3l14 8-6 1.5L10 19z" className="fill-ink stroke-surface" strokeWidth="1.5" strokeLinejoin="round" />
		</svg>
	)
}

/** Texto que aparece como se fosse digitado, a partir do atraso (`stagger-*`). */
export function Typed({ delay, className, children }: { delay: string; className?: string; children: ReactNode }) {
	return (
		<span className={cx('inline-block whitespace-nowrap animate-type-in motion-reduce:animate-none', delay, className)}>
			{children}
		</span>
	)
}

/**
 * A volta de uma demonstração em loop: depois de `ms`, some devagar (`leaving`) e começa de novo (a `round` nova, como
 * `key`, remonta e reinicia as animações). Com movimento reduzido, fica parada no estado final.
 */
export function useDemoRound(ms: number, fadeMs = 500) {
	const [round, setRound] = useState(0)
	const [leaving, setLeaving] = useState(false)

	useEffect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
		const fade = setTimeout(() => setLeaving(true), ms)
		const next = setTimeout(() => {
			setLeaving(false)
			setRound(value => value + 1)
		}, ms + fadeMs)
		return () => {
			clearTimeout(fade)
			clearTimeout(next)
		}
	}, [round, ms, fadeMs])

	return { round, leaving }
}
