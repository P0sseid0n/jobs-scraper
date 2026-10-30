import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { cx } from '../lib/cx'
import { GLIDE, reducedMotion, shake } from '../lib/motion'
import { dismissToast, type Toast } from '../stores/toast'
import { Icon } from './Icon'
import { IconButton } from './ui/IconButton'

/** Arrastado mais que essa fração da largura (ou jogado mais rápido que `FLICK_SPEED`, em px/ms), o aviso vai embora. */
const DISMISS_FRACTION = 0.35
const FLICK_SPEED = 0.5
const DRAG_THRESHOLD_PX = 4
const LEAVE_MS = 260
/** A duração do `animate-toast-in` (tailwind.css). */
const ENTER_MS = 450
/** O `gap-2` entre os avisos, que some junto com o que sai. */
const GAP_PX = 8

/**
 * Os avisos que chegam embaixo da tela, empilhados: os mais antigos encolhem um pouco para trás (e voltam com o mouse
 * em cima da pilha). Cada um tem a barra do tempo que falta, que para com o mouse em cima, e pode ser arrastado para o
 * lado para ir embora.
 */
export function Toasts({ toasts }: { toasts: Toast[] }) {
	return (
		<div
			className="group/toasts pointer-events-none fixed inset-x-4 bottom-6 z-40 mx-auto flex max-w-115 flex-col gap-2 max-md:bottom-safe-21"
			aria-live="polite"
		>
			{toasts.map((toast, index) => (
				<ToastItem key={toast.id} toast={toast} depth={toasts.length - 1 - index} />
			))}
		</div>
	)
}

type Drag = { pointerId: number; startX: number; moved: boolean; lastX: number; lastTime: number; speed: number }

function ToastItem({ toast, depth }: { toast: Toast; depth: number }) {
	const outer = useRef<HTMLDivElement>(null)
	const inner = useRef<HTMLDivElement>(null)
	const drag = useRef<Drag | null>(null)
	const [dragging, setDragging] = useState(false)
	const leaving = useRef(false)

	// Depois de entrar (o `animate-toast-in`), no contêiner de fora: o de dentro já tem a própria animação
	useEffect(() => {
		if (toast.shake && outer.current) shake(outer.current, ENTER_MS)
	}, [toast.shake])

	/** Sai para o lado (`direction`: -1, 1) ou encolhendo (0), e o espaço dele fecha antes de sair da lista. */
	function close(direction: -1 | 0 | 1 = 0) {
		const box = outer.current
		const content = inner.current
		if (leaving.current) return
		leaving.current = true
		if (!box || !content || reducedMotion()) return dismissToast(toast.id)

		box.inert = true
		const { transform, opacity } = getComputedStyle(content)
		content.animate(
			[
				{ transform, opacity },
				{ transform: direction ? `translateX(${direction * 110}%)` : 'scale(0.9)', opacity: 0 },
			],
			{ duration: LEAVE_MS, easing: direction ? 'ease-out' : 'ease-in', fill: 'forwards' },
		)
		const done = () => dismissToast(toast.id)
		box.animate([{ height: `${box.offsetHeight}px` }, { height: '0px', marginTop: `-${GAP_PX}px` }], {
			delay: LEAVE_MS * 0.6,
			duration: LEAVE_MS,
			easing: GLIDE,
			fill: 'forwards',
		}).finished.then(done, done)
	}

	function follow(dx: number) {
		const content = inner.current!
		content.style.transform = `translateX(${dx}px)`
		content.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / content.offsetWidth))
	}

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		// O botão de fechar continua sendo só clique
		if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
		event.currentTarget.setPointerCapture(event.pointerId)
		drag.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			moved: false,
			lastX: event.clientX,
			lastTime: event.timeStamp,
			speed: 0,
		}
	}

	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		const current = drag.current
		if (!current || current.pointerId !== event.pointerId) return
		if (!current.moved) {
			if (Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD_PX) return
			current.moved = true
			setDragging(true)
		}

		const elapsed = event.timeStamp - current.lastTime
		if (elapsed > 0) current.speed = (event.clientX - current.lastX) / elapsed
		current.lastX = event.clientX
		current.lastTime = event.timeStamp
		follow(event.clientX - current.startX)
	}

	function onPointerUp(event: PointerEvent<HTMLDivElement>) {
		const current = drag.current
		if (!current || current.pointerId !== event.pointerId) return
		drag.current = null
		if (!current.moved) return

		setDragging(false)
		const content = inner.current!
		const dx = event.clientX - current.startX
		const flick = Math.abs(current.speed) > FLICK_SPEED && Math.sign(current.speed) === Math.sign(dx)
		if (flick || Math.abs(dx) > content.offsetWidth * DISMISS_FRACTION) return close(dx > 0 ? 1 : -1)

		// Não foi longe: volta para o lugar com a mola
		const { transform, opacity } = content.style
		content.style.removeProperty('transform')
		content.style.removeProperty('opacity')
		if (!reducedMotion()) {
			content.animate(
				[
					{ transform, opacity },
					{ transform: 'none', opacity: 1 },
				],
				{
					duration: 400,
					easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
				},
			)
		}
	}

	function onPointerCancel() {
		const moved = drag.current?.moved
		drag.current = null
		if (!moved) return
		setDragging(false)
		inner.current?.style.removeProperty('transform')
		inner.current?.style.removeProperty('opacity')
	}

	return (
		<div
			ref={outer}
			className="toast-stack pointer-events-auto origin-bottom"
			style={{ '--depth': Math.min(depth, 3) } as CSSProperties}
		>
			<div
				ref={inner}
				className={cx(
					'group/toast relative flex touch-pan-y items-center gap-2.5 overflow-hidden rounded-md bg-ink py-2 pr-2 pl-3.5 text-sm text-bg shadow-float select-none animate-toast-in motion-reduce:animate-none',
					toast.tone === 'error' && 'border border-danger bg-danger-bg text-danger',
					dragging && 'cursor-ew-resize',
				)}
				role={toast.tone === 'error' ? 'alert' : 'status'}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerCancel}
			>
				<span className="grow">{toast.message}</span>
				{toast.action && (
					<button
						type="button"
						className="shrink-0 cursor-pointer rounded-xs border-0 bg-transparent px-1 py-1 font-semibold text-current underline underline-offset-3 pointer-coarse:min-h-11"
						onClick={() => {
							toast.action!.run()
							close()
						}}
					>
						{toast.action.label}
					</button>
				)}
				<IconButton label="Fechar aviso" size="sm" onClick={() => close()}>
					<Icon name="close" size={14} />
				</IconButton>
				{/* O tempo que falta: esvazia até o aviso ir embora; para com o mouse ou o foco em cima, e enquanto é arrastado */}
				<span
					aria-hidden="true"
					className={cx(
						'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-40 animate-drain',
						'group-hover/toasts:paused group-focus-within/toast:paused',
						dragging && 'paused',
					)}
					style={{ animationDuration: `${toast.duration}ms` }}
					onAnimationEnd={() => close()}
				/>
			</div>
		</div>
	)
}
