import { useLayoutEffect, useRef, useState } from 'react'

type IndicatorBox = {
	left: number
	width: number
	/** Já estava em outro item: desliza até este. Na primeira medida, aparece direto no lugar. */
	slide: boolean
}

/**
 * Marcador que desliza até o item ativo (a aba escolhida, a tela atual): mede o item que casa com `selector` dentro do
 * container (que precisa de `relative`). Mede de novo quando `active` muda e quando o container ou um item muda de
 * tamanho (a fonte carregando, a tela mudando de largura).
 */
export function useSlidingIndicator<E extends HTMLElement>(selector: string, active: unknown) {
	const container = useRef<E>(null)
	const [box, setBox] = useState<IndicatorBox | null>(null)

	useLayoutEffect(() => {
		const element = container.current
		if (!element) return

		function measure() {
			const item = element?.querySelector<HTMLElement>(selector)
			setBox(current => {
				if (!item) return null
				if (current?.left === item.offsetLeft && current.width === item.offsetWidth) return current
				return { left: item.offsetLeft, width: item.offsetWidth, slide: current !== null }
			})
		}

		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		for (const child of element.children) observer.observe(child)
		return () => observer.disconnect()
	}, [selector, active])

	return { container, box }
}
