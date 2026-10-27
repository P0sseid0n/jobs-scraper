import { useLayoutEffect, useRef } from 'react'

import { GLIDE, reducedMotion } from './motion'

const MOVE_MS = 450
const ENTER_MS = 450
const LEAVE_MS = 220
/** Degrau entre os itens que entram juntos; a partir do oitavo, entram junto com ele. */
const STAGGER_MS = 45
const MAX_STAGGER = 8
/** Saindo muitos de uma vez (a lista toda trocada), só os primeiros visíveis animam. */
const MAX_LEAVING = 12

type Box = { node: HTMLElement; x: number; y: number; width: number; height: number; visible: boolean }

/** Onde está cada item (filho direto com `data-flip-key`), relativo à lista, e se aparece na tela. */
function measure(list: HTMLElement) {
	const origin = list.getBoundingClientRect()
	const boxes = new Map<string, Box>()

	for (const node of list.querySelectorAll<HTMLElement>(':scope > [data-flip-key]')) {
		const rect = node.getBoundingClientRect()
		boxes.set(node.dataset.flipKey!, {
			node,
			x: rect.left - origin.left,
			y: rect.top - origin.top,
			width: rect.width,
			height: rect.height,
			visible: rect.bottom > 0 && rect.top < innerHeight,
		})
	}

	return boxes
}

function enter(node: HTMLElement, index: number) {
	node.animate(
		[
			{ opacity: 0, transform: 'translateY(12px) scale(0.98)' },
			{ opacity: 1, transform: 'none' },
		],
		{
			duration: ENTER_MS,
			easing: GLIDE,
			delay: Math.min(index, MAX_STAGGER) * STAGGER_MS,
			fill: 'backwards',
		},
	)
}

/** O item que saiu (já fora da lista do React) volta por cima dela, no lugar onde estava, e some. */
function leave(box: Box, layer: HTMLElement) {
	const { node } = box
	node.inert = true
	Object.assign(node.style, {
		position: 'absolute',
		left: `${box.x}px`,
		top: `${box.y}px`,
		width: `${box.width}px`,
		height: `${box.height}px`,
		margin: '0',
	})
	layer.append(node)

	const remove = () => node.remove()
	node
		.animate(
			[
				{ opacity: 1, transform: 'none' },
				{ opacity: 0, transform: 'scale(0.96)' },
			],
			{
				duration: LEAVE_MS,
				easing: 'ease-in',
				fill: 'forwards',
			},
		)
		.finished.then(remove, remove)
}

/**
 * Anima a lista quando os itens mudam (filtro, página nova, vagas novas no topo), com a técnica FLIP: quem continua
 * desliza da posição antiga para a nova, quem entra cresce no lugar (um depois do outro) e quem sai encolhe e some.
 * `keys` são as chaves dos itens, na ordem; na lista (`list`), os itens são os filhos diretos com `data-flip-key`, e
 * `ghosts` é uma camada vazia (`absolute inset-0`) dentro dela, que recebe os que saem enquanto somem. Quando a lista
 * aparece (inclusive no lugar do esqueleto), os itens visíveis entram em cascata.
 */
export function useFlipList(keys: string[]) {
	const list = useRef<HTMLDivElement>(null)
	const ghosts = useRef<HTMLDivElement>(null)
	/** As chaves que estão na tela e o elemento da lista em que estão (sem ele, a lista ainda não apareceu). */
	const committed = useRef<string | null>(null)
	const shown = useRef<HTMLDivElement | null>(null)
	const before = useRef<{ signature: string; boxes: Map<string, Box> } | null>(null)

	const signature = keys.join('\n')
	// Ainda no render, com a lista antiga na tela: guarda onde cada item estava (uma vez por mudança)
	if (list.current && committed.current !== null && signature !== committed.current && before.current?.signature !== signature) {
		before.current = { signature, boxes: measure(list.current) }
	}

	useLayoutEffect(() => {
		const element = list.current
		const mounting = element !== shown.current
		shown.current = element
		const old = before.current?.signature === signature ? before.current.boxes : null
		committed.current = signature
		before.current = null
		if (!element || reducedMotion()) return

		// Interrompida no meio, cada item parte de onde está agora: a medida antiga já incluía a animação em curso
		for (const node of element.querySelectorAll<HTMLElement>(':scope > [data-flip-key]')) {
			for (const animation of node.getAnimations()) animation.cancel()
		}
		const boxes = measure(element)

		if (mounting) {
			let index = 0
			for (const box of boxes.values()) if (box.visible) enter(box.node, index++)
			return
		}
		if (!old) return

		let entering = 0
		for (const [key, box] of boxes) {
			const from = old.get(key)
			if (!from) {
				if (box.visible) enter(box.node, entering++)
				continue
			}

			const dx = from.x - box.x
			const dy = from.y - box.y
			if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || (!from.visible && !box.visible)) continue
			box.node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE_MS, easing: GLIDE })
		}

		let leaving = 0
		for (const [key, from] of old) {
			if (boxes.has(key) || !from.visible || from.node.isConnected || !ghosts.current) continue
			if (leaving++ >= MAX_LEAVING) break
			leave(from, ghosts.current)
		}
	}, [signature])

	return { list, ghosts }
}
