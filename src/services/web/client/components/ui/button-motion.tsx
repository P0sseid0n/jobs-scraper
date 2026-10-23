import { isValidElement, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type Ref } from 'react'

import { cx } from '../../lib/cx'

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

function reducedMotion() {
	return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** O que identifica o conteúdo do botão: o texto e o nome dos ícones (`<Icon name>`). Mudou, anima a troca. */
function contentKey(node: ReactNode): string {
	if (node == null || typeof node === 'boolean') return ''
	if (typeof node === 'string' || typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(contentKey).join('')
	if (isValidElement(node)) {
		const { name, children } = node.props as { name?: unknown; children?: ReactNode }
		return `${typeof name === 'string' ? `<${name}>` : ''}${contentKey(children)}`
	}
	return ''
}

/** Onda que se espalha do ponto apertado, na cor do texto. Criada direto no DOM: não re-renderiza o botão. */
function ripple(event: PointerEvent<HTMLElement>) {
	const element = event.currentTarget
	if (event.button !== 0 || element.matches(':disabled') || reducedMotion()) return

	const rect = element.getBoundingClientRect()
	// O botão já pode estar afundando (`scale`): volta para as medidas sem a escala
	const scale = rect.width / element.offsetWidth || 1
	const x = (event.clientX - rect.left) / scale
	const y = (event.clientY - rect.top) / scale
	const size = 2 * Math.hypot(Math.max(x, element.offsetWidth - x), Math.max(y, element.offsetHeight - y))

	const wave = document.createElement('span')
	wave.setAttribute('aria-hidden', 'true')
	wave.className = 'pointer-events-none absolute -translate-1/2 rounded-full bg-current/15 animate-ripple'
	Object.assign(wave.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` })
	wave.addEventListener('animationend', () => wave.remove())
	element.append(wave)
}

/**
 * Movimento do `Button`: a onda do clique e, quando o texto (ou o ícone) muda, o novo sobe de baixo enquanto o antigo
 * sai por cima, e a largura do botão cresce com mola (nunca encolhe). O botão precisa de `relative overflow-clip`.
 */
export function useButtonMotion<E extends HTMLElement>(
	children: ReactNode,
	onPointerDown?: (event: PointerEvent<E>) => void,
	ref?: Ref<E>,
) {
	const element = useRef<E | null>(null)
	const key = contentKey(children)
	const [shownKey, setShownKey] = useState(key)
	const [leaving, setLeaving] = useState<{ id: number; node: ReactNode } | null>(null)
	const lastChildren = useRef(children)
	const fromWidth = useRef<number | null>(null)
	const swaps = useRef(0)

	if (shownKey !== key) {
		// Ainda na renderização: o DOM tem o conteúdo antigo, com a largura de antes da troca
		fromWidth.current = element.current?.offsetWidth ?? null
		swaps.current += 1
		setShownKey(key)
		setLeaving(reducedMotion() ? null : { id: swaps.current, node: lastChildren.current })
	}

	useLayoutEffect(() => {
		lastChildren.current = children
	})

	useLayoutEffect(() => {
		const from = fromWidth.current
		const target = element.current
		fromWidth.current = null
		if (from === null || !target) return
		target.style.minWidth = ''
		const to = target.offsetWidth
		// Texto mais curto (ex.: "salvar alterações" → "salvando…"): o botão fica na largura que tinha, em vez de
		// encolher e crescer de novo quando o texto volta
		if (to < from) target.style.minWidth = `${from}px`
		else if (to - from >= 1 && !reducedMotion())
			target.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 420, easing: SPRING })
	}, [key])

	const content = (
		<>
			{leaving && (
				<span
					key={`leaving-${leaving.id}`}
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center gap-inherit animate-text-out"
					onAnimationEnd={() => setLeaving(current => (current?.id === leaving.id ? null : current))}
				>
					{leaving.node}
				</span>
			)}
			<span
				key={`shown-${swaps.current}`}
				className={cx(
					'inline-flex items-center justify-center gap-inherit',
					swaps.current > 0 && 'animate-text-in motion-reduce:animate-none',
				)}
			>
				{children}
			</span>
		</>
	)

	return {
		content,
		ref: (node: E | null) => {
			element.current = node
			if (typeof ref === 'function') ref(node)
			else if (ref) ref.current = node
		},
		onPointerDown: (event: PointerEvent<E>) => {
			ripple(event)
			onPointerDown?.(event)
		},
	}
}
