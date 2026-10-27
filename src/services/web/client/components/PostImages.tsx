import { useEffect, useRef, useState, type PointerEvent } from 'react'

import type { WebJob } from '../../api-types'
import { jobImageUrl } from '../api'
import { cx } from '../lib/cx'
import { stepImage, swipeStep } from '../lib/image-viewer'
import { Icon } from './Icon'
import { Badge } from './ui/Badge'
import { IconButton } from './ui/IconButton'
import { NEW_TAB_NOTICE } from './ui/link'
import { PRESS } from './ui/press'

type PostImagesJob = Pick<WebJob, 'postId' | 'imageCount'>

const imageLabel = (index: number, count: number) => `imagem ${index + 1} de ${count} do post`

/**
 * As imagens do post numa faixa que rola de lado, na proporção original (a arte da vaga não é cortada); cada uma abre
 * no visualizador em tamanho real.
 */
export function PostImages({ job }: { job: PostImagesJob }) {
	const [open, setOpen] = useState<number | null>(null)
	if (job.imageCount === 0) return null

	const indexes = Array.from({ length: job.imageCount }, (_, index) => index)

	return (
		<>
			<ul
				className="m-0 flex list-none snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain p-0 pb-1"
				aria-label="Imagens do post"
			>
				{indexes.map(index => (
					<li key={index} className="shrink-0 snap-start">
						<button
							type="button"
							className={cx(
								'group relative block overflow-hidden rounded-md border border-line bg-surface-2 p-0 hover:border-line-strong',
								PRESS,
							)}
							aria-label={`ampliar ${imageLabel(index, job.imageCount)}`}
							aria-haspopup="dialog"
							onClick={() => setOpen(index)}
						>
							{/* Altura fixa e largura pela proporção: a faixa não pula quando a imagem carrega */}
							<img
								className="block h-50 w-auto max-w-[min(26rem,80vw)] min-w-24 object-contain"
								src={jobImageUrl(job.postId, index)}
								alt={imageLabel(index, job.imageCount)}
								loading="lazy"
							/>
							<span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden">
								<Icon name="expand" size={14} />
							</span>
						</button>
					</li>
				))}
			</ul>
			{open !== null && <ImageViewer job={job} start={open} onClose={() => setOpen(null)} />}
		</>
	)
}

/**
 * Visualizador em tela cheia: fundo escuro, a imagem solta, setas e ← → (ou deslizar no toque) para trocar, o
 * contador e o link para o arquivo original. Esc, o botão de fechar ou um clique fora da imagem fecham.
 */
function ImageViewer({ job, start, onClose }: { job: PostImagesJob; start: number; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	const [index, setIndex] = useState(start)
	const swipeFrom = useRef<{ x: number; y: number } | null>(null)
	// O clique que o navegador às vezes dispara no fim de um deslize não fecha o visualizador
	const swiped = useRef(false)
	const count = job.imageCount
	const src = jobImageUrl(job.postId, index)
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
			aria-label={imageLabel(index, count)}
			onClose={onClose}
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
					<Badge tone="neutral" size="sm" aria-live="polite">
						{index + 1} / {count}
					</Badge>
					<div className="flex items-center gap-1">
						<a
							className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-mono text-muted text-xs no-underline hover:bg-surface-2 hover:text-ink"
							href={src}
							target="_blank"
							rel="noreferrer"
						>
							abrir original
							<span className="sr-only">{NEW_TAB_NOTICE}</span>
							<Icon name="external" size={13} />
						</a>
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
						src={src}
						alt={imageLabel(index, count)}
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

/** Selo do card da lista: o post tem imagem, e quantas (os dados da vaga podem ter vindo dela). */
export function PostImagesBadge({ job }: { job: Pick<WebJob, 'imageCount'> }) {
	if (job.imageCount === 0) return null

	const title = job.imageCount === 1 ? 'O post tem 1 imagem' : `O post tem ${job.imageCount} imagens`

	return (
		<Badge tone="plain" bordered size="sm" className="text-muted" title={title}>
			<Icon name="image" size={13} />
			<span aria-hidden="true">{job.imageCount}</span>
			<span className="sr-only">{title.toLowerCase()}</span>
		</Badge>
	)
}
