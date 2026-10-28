import { useEffect, useState } from 'react'

import { cx } from '../../lib/cx'
import { reducedMotion } from '../../lib/motion'
import { pill } from './Pill'

/** A margem do cabeçalho e dos atalhos fixos: vai em cada seção, para ela não parar debaixo deles ao pular até ela. */
export const SECTION_SCROLL_MARGIN = 'scroll-mt-32'

export type SectionNavItem = { id: string; label: string }

/**
 * Atalhos para as seções de uma tela longa, fixos abaixo do cabeçalho. Cada `id` é o de uma seção da tela (com
 * `SECTION_SCROLL_MARGIN`). Marca a última seção cujo topo já passou de um terço da tela (no fim da página, a última).
 */
export function SectionNav({ sections, label, className }: {
	/** Fixa (fora do componente ou num `useMemo`): ela muda o efeito que acompanha a rolagem. */
	sections: readonly SectionNavItem[]
	label: string
	className?: string
}) {
	const [current, setCurrent] = useState(sections[0]?.id)

	useEffect(() => {
		let frame = 0
		function update() {
			frame = 0
			const line = window.innerHeight / 3
			const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
			let active = sections[0]?.id
			for (const { id } of sections) {
				const top = document.getElementById(id)?.getBoundingClientRect().top
				if (top !== undefined && top <= line) active = id
			}
			setCurrent(atBottom ? sections[sections.length - 1]?.id : active)
		}
		function schedule() {
			if (!frame) frame = requestAnimationFrame(update)
		}

		update()
		window.addEventListener('scroll', schedule, { passive: true })
		window.addEventListener('resize', schedule)
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener('scroll', schedule)
			window.removeEventListener('resize', schedule)
		}
	}, [sections])

	return (
		<nav
			aria-label={label}
			className={cx('sticky top-16 z-10 -my-2 flex flex-wrap gap-1.5 bg-bg/88 py-2 backdrop-blur-md', className)}
		>
			{sections.map(({ id, label }) => (
				<button
					key={id}
					type="button"
					aria-current={current === id ? 'true' : undefined}
					className={pill({ className: current === id && 'border-ink bg-ink text-bg' })}
					onClick={() =>
						document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
					}
				>
					{label}
				</button>
			))}
		</nav>
	)
}
