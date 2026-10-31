import { useState } from 'react'

import type { WebJob } from '../../api-types'
import { jobImageUrl } from '../api'
import { useT } from '../stores/locale'
import { Icon } from './Icon'
import { Badge } from './ui/Badge'
import { ImageThumb } from './ui/ImageThumb'
import { ImageViewer } from './ui/ImageViewer'

type PostImagesJob = Pick<WebJob, 'postId' | 'imageCount'>

/**
 * As imagens do post numa faixa que rola de lado, na proporção original (a arte da vaga não é cortada); cada uma abre
 * no visualizador em tamanho real.
 */
export function PostImages({ job }: { job: PostImagesJob }) {
	const t = useT()
	const [open, setOpen] = useState<number | null>(null)
	if (job.imageCount === 0) return null

	const images = Array.from({ length: job.imageCount }, (_, index) => ({
		src: jobImageUrl(job.postId, index),
		alt: t.jobCard.imageLabel(index + 1, job.imageCount),
	}))

	return (
		<>
			{/* A folga de 4px em volta (com a margem negativa, a faixa não sai do lugar) é para a miniatura crescer no hover sem ser cortada */}
			<ul
				className="-mx-1 -mt-1 flex list-none snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain p-1"
				aria-label={t.jobCard.postImages}
			>
				{images.map((image, index) => (
					<li key={image.src} className="shrink-0 snap-start">
						<ImageThumb
							label={t.jobCard.zoom(image.alt)}
							className="rounded-md border border-line bg-surface-2 hover:border-line-strong"
							onOpen={() => setOpen(index)}
						>
							{/* Altura fixa e largura pela proporção: a faixa não pula quando a imagem carrega */}
							<img
								className="block h-50 w-auto max-w-[min(26rem,80vw)] min-w-24 object-contain"
								src={image.src}
								alt={image.alt}
								loading="lazy"
							/>
						</ImageThumb>
					</li>
				))}
			</ul>
			{open !== null && <ImageViewer images={images} start={open} onClose={() => setOpen(null)} />}
		</>
	)
}

/** Selo do card da lista: o post tem imagem, e quantas (os dados da vaga podem ter vindo dela). */
export function PostImagesBadge({ job }: { job: Pick<WebJob, 'imageCount'> }) {
	const t = useT()
	if (job.imageCount === 0) return null

	const title = t.jobCard.imageCount(job.imageCount)

	return (
		<Badge tone="plain" bordered size="sm" className="text-muted" title={title}>
			<Icon name="image" size={13} />
			<span aria-hidden="true">{job.imageCount}</span>
			<span className="sr-only">{title.toLowerCase()}</span>
		</Badge>
	)
}
