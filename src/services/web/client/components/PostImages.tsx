import { useEffect, useRef, useState } from 'react'

import type { WebJob } from '../../api-types'
import { jobImageUrl } from '../api'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { DIALOG } from './ui/Dialog'
import { IconButton } from './ui/IconButton'
import { PRESS } from './ui/press'

/** As imagens do post como miniaturas; cada uma abre em tamanho real numa modal. */
export function PostImages({ job }: { job: Pick<WebJob, 'postId' | 'imageCount'> }) {
	const [open, setOpen] = useState<number | null>(null)
	if (job.imageCount === 0) return null

	const indexes = Array.from({ length: job.imageCount }, (_, index) => index)
	const label = (index: number) => `imagem ${index + 1} de ${job.imageCount} do post`

	return (
		<>
			<ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Imagens do post">
				{indexes.map(index => (
					<li key={index}>
						<button
							type="button"
							className={cx(
								'block overflow-hidden rounded-sm border border-line bg-surface-2 p-0 hover:border-line-strong',
								PRESS,
							)}
							aria-label={`ampliar ${label(index)}`}
							aria-haspopup="dialog"
							onClick={() => setOpen(index)}
						>
							<img
								className="block size-24 object-cover"
								src={jobImageUrl(job.postId, index)}
								alt={label(index)}
								loading="lazy"
							/>
						</button>
					</li>
				))}
			</ul>
			{open !== null && <ImageDialog src={jobImageUrl(job.postId, open)} alt={label(open)} onClose={() => setOpen(null)} />}
		</>
	)
}

function ImageDialog({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className={cx(DIALOG, 'w-fit max-w-[min(64rem,calc(100vw-2rem))]')}
			aria-label={alt}
			onClose={onClose}
			// Clique fora da imagem (no fundo escurecido) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="relative">
				<img className="block max-h-[calc(100dvh-4rem)] max-w-full object-contain" src={src} alt={alt} />
				<IconButton
					label="fechar imagem"
					size="sm"
					className="absolute top-2 right-2 bg-surface text-ink"
					onClick={() => ref.current?.close()}
				>
					<Icon name="close" size={15} />
				</IconButton>
			</div>
		</dialog>
	)
}
