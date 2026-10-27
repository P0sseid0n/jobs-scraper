import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** Larguras da coluna dos filtros no desktop: as classes `md:w-12` (fechados) e `md:w-66` (abertos) do `Filters`. */
const CLOSED_PX = 48
const OPEN_PX = 264
/** Andar mais que isso com o botão apertado é arrastar; menos, é clique. */
const DRAG_THRESHOLD_PX = 4
/** Soltando mais rápido que isso (px/ms), vale a direção do gesto, e não de que lado da metade a coluna está. */
const FLICK_SPEED = 0.4

type Gesture = {
	pointerId: number
	startX: number
	startWidth: number
	moved: boolean
	lastX: number
	lastTime: number
	speed: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * O botão dos filtros (desktop) como alça: clicado, abre ou fecha; arrastado na horizontal, a coluna acompanha o mouse
 * e, ao soltar, termina de abrir ou fechar (para o lado do gesto, se rápido, ou o mais perto). Pegar a coluna no meio
 * da animação a congela onde está; clicar no meio dela inverte (a transição do CSS volta de onde estava).
 *
 * Enquanto arrasta, a largura da coluna (`aside`) e a opacidade do conteúdo (`content`) ficam no `style`, sem
 * transição; ao soltar, saem do `style` e a transição das classes leva do ponto em que estavam até o fim.
 */
export function useFiltersDrag({
	aside,
	content,
	open,
	setOpen,
}: {
	aside: RefObject<HTMLElement | null>
	content: RefObject<HTMLElement | null>
	open: boolean
	setOpen: (open: boolean) => void
}) {
	const [dragging, setDragging] = useState(false)
	/** Para onde a coluna vai se soltar agora: o ícone do botão já mostra o que vai acontecer. */
	const [previewOpen, setPreviewOpen] = useState(open)
	const gesture = useRef<Gesture | null>(null)
	/** O `click` que vem depois de um arrasto não conta como clique. */
	const dragged = useRef(false)

	useEffect(() => setPreviewOpen(open), [open])

	/** Larguras e opacidade direto no `style`, seguindo o mouse (`progress` de 0, fechada, a 1, aberta). */
	function follow(width: number) {
		const progress = (width - CLOSED_PX) / (OPEN_PX - CLOSED_PX)
		aside.current!.style.width = `${width}px`
		content.current!.style.opacity = String(clamp((progress - 0.15) / 0.7, 0, 1))
		setPreviewOpen(progress > 0.5)
	}

	/** Solta: as classes de `next` assumem e a transição parte de onde a coluna ficou. */
	function settle(next: boolean) {
		// As classes novas já na tela (sem esperar o próximo quadro, que o navegador pode atrasar): aí volta a transição e
		// só então a largura sai do `style`, para a transição partir dela
		flushSync(() => {
			setDragging(false)
			setOpen(next)
			setPreviewOpen(next)
		})
		for (const element of [aside.current, content.current]) element?.style.removeProperty('transition')
		void aside.current?.offsetWidth
		aside.current?.style.removeProperty('width')
		content.current?.style.removeProperty('opacity')
	}

	const handleProps = {
		onPointerDown(event: PointerEvent<HTMLElement>) {
			if (event.button !== 0) return
			// Um arrasto que terminou sem o `click` (soltou fora da janela) não engole o clique seguinte
			dragged.current = false
			event.currentTarget.setPointerCapture(event.pointerId)
			gesture.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startWidth: 0,
				moved: false,
				lastX: event.clientX,
				lastTime: event.timeStamp,
				speed: 0,
			}
		},
		onPointerMove(event: PointerEvent<HTMLElement>) {
			const current = gesture.current
			if (!current || current.pointerId !== event.pointerId || !aside.current || !content.current) return

			if (!current.moved) {
				if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return
				// Começou a arrastar: a coluna para onde está (mesmo no meio de uma animação) e passa a seguir o mouse
				current.moved = true
				current.startX = event.clientX
				current.startWidth = aside.current.getBoundingClientRect().width
				const opacity = getComputedStyle(content.current).opacity
				for (const element of [aside.current, content.current]) element.style.transition = 'none'
				content.current.style.opacity = opacity
				setDragging(true)
			}

			const elapsed = event.timeStamp - current.lastTime
			if (elapsed > 0) current.speed = (event.clientX - current.lastX) / elapsed
			current.lastX = event.clientX
			current.lastTime = event.timeStamp
			follow(clamp(current.startWidth + event.clientX - current.startX, CLOSED_PX, OPEN_PX))
		},
		onPointerUp(event: PointerEvent<HTMLElement>) {
			const current = gesture.current
			if (!current || current.pointerId !== event.pointerId) return
			gesture.current = null
			if (!current.moved) return

			dragged.current = true
			const width = aside.current?.getBoundingClientRect().width ?? CLOSED_PX
			settle(Math.abs(current.speed) > FLICK_SPEED ? current.speed > 0 : width > (CLOSED_PX + OPEN_PX) / 2)
		},
		onPointerCancel() {
			const current = gesture.current
			gesture.current = null
			if (current?.moved) settle(open)
		},
		onClick() {
			if (dragged.current) {
				dragged.current = false
				return
			}
			setOpen(!open)
		},
		// Pelo teclado: Enter e espaço alternam (o clique); as setas abrem e fecham
		onKeyDown(event: KeyboardEvent<HTMLElement>) {
			if (event.key === 'ArrowRight' && !open) setOpen(true)
			else if (event.key === 'ArrowLeft' && open) setOpen(false)
		},
	}

	return { dragging, previewOpen, handleProps }
}
