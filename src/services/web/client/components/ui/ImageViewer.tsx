import { useEffect, useRef, useState, type PointerEvent } from 'react'

import { stepImage, swipeStep } from '../../lib/image-viewer'
import { Icon } from '../Icon'
import { Badge } from './Badge'
import { IconButton } from './IconButton'
import { NEW_TAB_NOTICE } from './link'

/** Uma imagem do visualizador: o endereço e o texto alternativo (que também nomeia o visualizador aberto nela). */
export type ViewerImage = { src: string; alt: string }

type ImageViewerProps = {
	images: readonly ViewerImage[]
	/** A imagem que abre primeiro. */
	start?: number
	/** O link "abrir original", para o arquivo numa aba nova; desligue quando o arquivo não existe fora da página (um PNG gerado). */
	original?: boolean
	onClose: () => void
}

/**
 * Visualizador em tela cheia: fundo escuro, a imagem solta, setas e ← → (ou deslizar no toque) para trocar, o
 * contador e o link para o arquivo original. Esc, o botão de fechar ou um clique fora da imagem fecham. Abre ao montar:
 * renderize só enquanto estiver aberto.
 */
export function ImageViewer({ images, start = 0, original = true, onClose }: ImageViewerProps) {
	const ref = useRef<HTMLDialogElement>(null)
	const [index, setIndex] = useState(start)
	const swipeFrom = useRef<{ x: number; y: number } | null>(null)
	// O clique que o navegador às vezes dispara no fim de um deslize não fecha o visualizador
	const swiped = useRef(false)
	const count = images.length
	const image = images[index]!
	const go = (step: number) => setIndex(current => stepImage(current, step, count))

	useEffect(() => {
		ref.current?.showModal()
		// O `showModal` foca o primeiro link ("abrir original"); o foco fica no fechar, como nas outras modais
		ref.current?.querySelector<HTMLButtonElement>('[data-close]')?.focus()
	}, [])

	function onPointerUp(event: PointerEvent) {
		const from = swipeFrom.current
		swipeFrom.current = null
		if (!from || event.pointerType === 'mouse') return

		const step = swipeStep(event.clientX - from.x, event.clientY - from.y)
		swiped.current = step !== 0
		if (step !== 0 && count > 1) go(step)
	}

	return (
		<dialog
			ref={ref}
			// O próprio diálogo cobre a tela e escurece o fundo: o `::backdrop` fica transparente
			className="inverted fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none animate-fade-in bg-black/90 p-0 backdrop:bg-transparent motion-reduce:animate-none"
			aria-label={image.alt}
			// O React repassa o `close` às <dialog> de cima na árvore: aberto dentro de outra modal (a de compartilhar), o
			// fechar da imagem fechava as duas
			onClose={event => {
				event.stopPropagation()
				onClose()
			}}
			onKeyDown={event => {
				if (count < 2) return
				if (event.key === 'ArrowRight') go(1)
				else if (event.key === 'ArrowLeft') go(-1)
			}}
			// Clique fora da imagem e dos controles fecha
			onClick={event => {
				if (swiped.current) swiped.current = false
				else if (event.target instanceof HTMLElement && 'closes' in event.target.dataset) ref.current?.close()
			}}
		>
			<div
				// `pan-y`: o deslize horizontal fica para trocar de imagem, sem o navegador tratar como gesto dele
				className="flex h-full touch-pan-y flex-col items-center justify-center gap-3 px-3 pt-15 pb-4 md:px-18"
				data-closes
				onPointerDown={event => {
					swipeFrom.current = { x: event.clientX, y: event.clientY }
				}}
				onPointerUp={onPointerUp}
			>
				<header className="fixed inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-3">
					{/* O contador só com mais de uma imagem: "1 / 1" não diz nada */}
					{count > 1 ? (
						<Badge tone="neutral" size="sm" aria-live="polite">
							{index + 1} / {count}
						</Badge>
					) : (
						<span />
					)}
					<div className="flex items-center gap-1">
						{original && (
							<a
								className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-muted text-xs no-underline hover:bg-surface-2 hover:text-ink"
								href={image.src}
								target="_blank"
								rel="noreferrer"
							>
								abrir original
								<span className="sr-only">{NEW_TAB_NOTICE}</span>
								<Icon name="external" size={13} />
							</a>
						)}
						<IconButton data-close label="fechar imagem" onClick={() => ref.current?.close()}>
							<Icon name="close" size={18} />
						</IconButton>
					</div>
				</header>

				{/* A imagem no tamanho do arquivo, e menor só quando não cabe na tela: ampliada além dele, ela fica pixelada */}
				<div className="flex min-h-0 w-full flex-1 items-center justify-center" data-closes>
					<img
						// Nova imagem, nova animação de entrada
						key={index}
						className="block max-h-full max-w-full animate-pop-in rounded-sm object-contain shadow-float select-none motion-reduce:animate-none"
						src={image.src}
						alt={image.alt}
						draggable={false}
					/>
				</div>

				{count > 1 && (
					<>
						<IconButton
							label="imagem anterior"
							bordered
							className="fixed top-1/2 left-4 -translate-y-1/2 bg-inv-bg/60 max-md:hidden"
							onClick={() => go(-1)}
						>
							<Icon name="back" size={18} />
						</IconButton>
						<IconButton
							label="próxima imagem"
							bordered
							className="fixed top-1/2 right-4 -translate-y-1/2 bg-inv-bg/60 max-md:hidden"
							onClick={() => go(1)}
						>
							<Icon name="forward" size={18} />
						</IconButton>
						<p className="m-0 font-mono text-muted text-xs md:hidden">deslize para ver a outra imagem</p>
					</>
				)}
			</div>
		</dialog>
	)
}
