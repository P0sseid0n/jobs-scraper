import { useEffect, useRef, useState, type ReactNode } from 'react'

import { tv } from '../lib/cx'
import { pdfThumbnail } from '../lib/pdf-thumbnail'

const sheet = tv({
	base: 'relative grid shrink-0 place-items-center overflow-hidden rounded-xs border border-line bg-surface font-mono text-xs text-muted',
	variants: {
		/** `sm`: itens da lista. `lg`: o currículo base. A proporção é a da folha A4. */
		size: { sm: 'h-17 w-12', lg: 'h-28 w-20' },
		/** Borda tracejada: o currículo ainda está sendo gerado. */
		dashed: { true: 'border-dashed text-lime-text' },
	},
	defaultVariants: { size: 'sm' },
})

/** Largura da miniatura em pixels de CSS (a imagem é desenhada com a densidade da tela). */
const WIDTHS = { sm: 48, lg: 80 }

type PdfThumbnailProps = {
	/** O PDF; sem ele (pendente, falho, sem pré-visualização), só a folha com `children`. */
	url?: string | null
	size?: 'sm' | 'lg'
	dashed?: boolean
	/** O que a folha mostra enquanto não há a imagem ("PDF", o spinner, "erro"). */
	children?: ReactNode
}

/**
 * A primeira página do PDF, numa folha do tamanho de `size` (decorativa). O PDF só é baixado e desenhado quando a folha
 * aparece na tela; até lá, e se falhar, mostra `children`.
 */
export function PdfThumbnail({ url, size = 'sm', dashed = false, children }: PdfThumbnailProps) {
	const ref = useRef<HTMLSpanElement>(null)
	const [src, setSrc] = useState<string | null>(null)

	useEffect(() => {
		setSrc(null)
		const element = ref.current
		if (!url || !element) return

		let cancelled = false
		const observer = new IntersectionObserver(
			entries => {
				if (!entries.some(entry => entry.isIntersecting)) return

				observer.disconnect()
				const width = Math.round(WIDTHS[size] * Math.min(window.devicePixelRatio || 1, 3))
				pdfThumbnail(url, width).then(
					image => !cancelled && setSrc(image),
					() => {
						// Sem miniatura, a folha continua com o texto
					},
				)
			},
			{ rootMargin: '200px' },
		)
		observer.observe(element)

		return () => {
			cancelled = true
			observer.disconnect()
		}
	}, [url, size])

	return (
		<span ref={ref} aria-hidden="true" className={sheet({ size, dashed })}>
			{children}
			{src && (
				<img
					src={src}
					alt=""
					className="absolute inset-0 size-full bg-white object-cover object-top animate-fade-in motion-reduce:animate-none"
				/>
			)}
		</span>
	)
}
