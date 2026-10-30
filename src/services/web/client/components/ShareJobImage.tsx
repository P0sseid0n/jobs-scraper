import { getFontEmbedCSS, toBlob } from 'html-to-image'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { jobShareCard, jobShareFileName, type ShareJob } from '@shared/templates'

import { cx } from '../lib/cx'
import { useCoarsePointer } from '../lib/media'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { ShareJobCard, type ShareCardFormat, type ShareCardTheme, type ShareCardTitleSize } from './ShareJobCard'
import { Button } from './ui/Button'
import { Pill, PILL_COUNT, PillGroup } from './ui/Pill'
import { Skeleton } from './ui/Skeleton'
import { SwitchField } from './ui/Switch'
import { LABEL } from './ui/text'

/** Copiar uma imagem (não só texto) para a área de transferência; sem isso, o botão nem aparece. */
const CAN_COPY_IMAGE = typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function'

/** O compartilhar do sistema aceita arquivos (celular, Safari, Chrome no Windows); sem isso, o botão nem aparece. */
const CAN_SHARE_FILES =
	typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'vaga.png', { type: 'image/png' })] })

const THEMES: { value: ShareCardTheme; label: string }[] = [
	{ value: 'light', label: 'claro' },
	{ value: 'dark', label: 'escuro' },
]

const FORMATS: { value: ShareCardFormat; label: string; ratio: string }[] = [
	{ value: 'post', label: 'post', ratio: '4:5' },
	{ value: 'story', label: 'story', ratio: '9:16' },
]

const TITLE_SIZES: { value: ShareCardTitleSize; label: string }[] = [
	{ value: 'large', label: 'grande' },
	{ value: 'small', label: 'pequeno' },
]

/** A prévia com a proporção do formato, enquanto o PNG ainda não existe. */
const PREVIEW_ASPECT: Record<ShareCardFormat, string> = { post: 'aspect-4/5', story: 'aspect-9/16' }

const OPTION = 'flex flex-col gap-1.5'

/**
 * A imagem da vaga, para status, stories e posts: o tema, o formato e o que aparece nela, a prévia (o próprio PNG) e os
 * jeitos de levar: baixar, copiar e o compartilhar do sistema (com o texto da modal junto). O PNG é montado no
 * navegador assim que algo muda, para estar pronto no clique: o copiar e o compartilhar precisam do clique ainda fresco.
 */
export function ShareJobImage({ job, text, onClose }: { job: ShareJob; text: string; onClose: () => void }) {
	const ids = { theme: useId(), format: useId(), titleSize: useId(), qr: useId(), skills: useId(), description: useId() }
	// Começa no tema que está na tela; trocar aqui não muda o do site
	const [theme, setTheme] = useState<ShareCardTheme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
	const [format, setFormat] = useState<ShareCardFormat>('post')
	const [titleSize, setTitleSize] = useState<ShareCardTitleSize>('large')
	const [qr, setQr] = useState(true)
	const [skills, setSkills] = useState(true)
	const [description, setDescription] = useState(true)
	const card = jobShareCard(job, { qr, skills, description })
	// O que a vaga tem para mostrar, com as opções ligadas: sem link público, tecnologias ou texto, a opção fica apagada
	const available = jobShareCard(job, { qr: true, skills: true, description: true })

	const node = useRef<HTMLDivElement>(null)
	const fontCss = useRef<Promise<string>>(undefined)
	const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
	const [generating, setGenerating] = useState(true)
	const [failed, setFailed] = useState(false)
	const fileName = jobShareFileName(job)
	const coarse = useCoarsePointer()
	const sharePrimary = CAN_SHARE_FILES && coarse

	useEffect(() => {
		let stale = false
		setGenerating(true)
		setFailed(false)

		async function generate() {
			// Sem as fontes carregadas, o PNG sai com a fonte de reserva
			await document.fonts.ready
			if (stale || !node.current) return
			// As fontes do site vão embutidas no PNG; buscadas uma vez só, servem a todas as versões da imagem
			fontCss.current ??= getFontEmbedCSS(node.current)
			const blob = await toBlob(node.current, { pixelRatio: 1, fontEmbedCSS: await fontCss.current })
			if (stale) return
			if (!blob) throw new Error('imagem vazia')

			setImage({ blob, url: URL.createObjectURL(blob) })
			setGenerating(false)
		}

		generate().catch(() => {
			if (stale) return
			fontCss.current = undefined
			setFailed(true)
			setGenerating(false)
		})

		return () => {
			stale = true
		}
	}, [theme, format, titleSize, qr, skills, description])

	// A imagem anterior (e a última, ao fechar) sai da memória
	useEffect(
		() => () => {
			if (image) URL.revokeObjectURL(image.url)
		},
		[image],
	)

	// A prévia fica com a altura toda da coluna de opções ao lado (a largura sai da proporção do formato)
	const options = useRef<HTMLDivElement>(null)
	const [previewHeight, setPreviewHeight] = useState<number>()

	useLayoutEffect(() => {
		const element = options.current
		if (!element) return
		const measure = () => setPreviewHeight(element.offsetHeight)
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		measure()
		return () => observer.disconnect()
	}, [])

	const ready = image !== null && !generating

	function download() {
		if (!image) return
		const link = document.createElement('a')
		link.href = image.url
		link.download = fileName
		link.click()
	}

	async function copy() {
		if (!image) return
		try {
			await navigator.clipboard.write([new ClipboardItem({ [image.blob.type]: image.blob })])
			notify('Imagem copiada', 'info')
		} catch {
			notify('Não consegui copiar a imagem; baixe o PNG', 'error')
		}
	}

	async function share() {
		if (!image) return
		const file = new File([image.blob], fileName, { type: image.blob.type })
		try {
			await navigator.share({ files: [file], text })
		} catch (error) {
			// Fechar a folha do sistema sem escolher um app não é erro
			if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Não consegui abrir o compartilhamento', 'error')
		}
	}

	return (
		<>
			<div className="flex min-h-0 grow flex-col overflow-y-auto px-5 py-4">
				{/* No celular, a prévia fica em cima, com a largura toda, e as opções embaixo */}
				<div className="flex items-start gap-5 max-sm:flex-col">
					<div className="shrink-0 max-sm:h-auto! max-sm:w-full" style={{ height: previewHeight }} aria-busy={generating}>
						{image ? (
							<img
								src={image.url}
								alt={`Imagem da vaga ${card.title}`}
								className={cx(
									'block h-full w-auto rounded-sm border border-line transition-opacity max-sm:h-auto max-sm:w-full',
									generating && 'opacity-50',
								)}
							/>
						) : (
							<Skeleton className={cx('h-full rounded-sm bg-surface-2 max-sm:h-auto max-sm:w-full', PREVIEW_ASPECT[format])} />
						)}
					</div>

					<div ref={options} className="flex min-w-0 grow flex-col gap-4 max-sm:w-full">
						<div className={OPTION}>
							<span id={ids.theme} className={LABEL}>
								tema
							</span>
							<PillGroup role="group" aria-labelledby={ids.theme}>
								{THEMES.map(option => (
									<Pill key={option.value} pressed={option.value === theme} onClick={() => setTheme(option.value)}>
										<Icon name={option.value === 'dark' ? 'moon' : 'sun'} size={14} />
										{option.label}
									</Pill>
								))}
							</PillGroup>
						</div>
						<div className={OPTION}>
							<span id={ids.format} className={LABEL}>
								formato
							</span>
							<PillGroup role="group" aria-labelledby={ids.format}>
								{FORMATS.map(option => (
									<Pill key={option.value} pressed={option.value === format} onClick={() => setFormat(option.value)}>
										{option.label}
										<span className={PILL_COUNT}>{option.ratio}</span>
									</Pill>
								))}
							</PillGroup>
						</div>
						<div className={OPTION}>
							<span id={ids.titleSize} className={LABEL}>
								título
							</span>
							<PillGroup role="group" aria-labelledby={ids.titleSize}>
								{TITLE_SIZES.map(option => (
									<Pill key={option.value} pressed={option.value === titleSize} onClick={() => setTitleSize(option.value)}>
										{option.label}
									</Pill>
								))}
							</PillGroup>
						</div>
						<div className="flex flex-col gap-3 text-sm">
							<SwitchField
								id={ids.qr}
								title="QR code"
								description={
									!available.qr
										? 'a vaga não tem link público'
										: available.qr.caption === 'Candidate-se'
											? 'leva à candidatura'
											: 'leva ao post original'
								}
								checked={qr && available.qr !== null}
								disabled={available.qr === null}
								onChange={setQr}
							/>
							<SwitchField
								id={ids.skills}
								title="tecnologias"
								description={available.skills.length === 0 ? 'a vaga não lista tecnologias' : undefined}
								checked={skills && available.skills.length > 0}
								disabled={available.skills.length === 0}
								onChange={setSkills}
							/>
							<SwitchField
								id={ids.description}
								title="descrição"
								description={available.description === null ? 'a vaga não tem texto' : 'o texto da vaga, até onde couber'}
								checked={description && available.description !== null}
								disabled={available.description === null}
								onChange={setDescription}
							/>
						</div>
						<p role="status" className="m-0 text-xs text-muted">
							{generating
								? 'Montando a imagem…'
								: failed
									? 'Não consegui montar a imagem. Mude uma opção para tentar de novo.'
									: null}
						</p>
					</div>
				</div>

				{/* O card no tamanho do PNG, fora da tela (no body: a modal, animada, prenderia o fixo nela): é dele que a imagem sai */}
				{createPortal(
					<div className="pointer-events-none fixed top-0 left-full" aria-hidden="true" inert>
						<ShareJobCard ref={node} card={card} theme={theme} format={format} titleSize={titleSize} />
					</div>,
					document.body,
				)}
			</div>

			<div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">
				<Button variant="ghost" onClick={onClose}>
					fechar
				</Button>
				{CAN_COPY_IMAGE && (
					<Button variant="ghost" disabled={!ready} onClick={copy}>
						<Icon name="copy" size={14} />
						copiar imagem
					</Button>
				)}
				{CAN_SHARE_FILES && (
					<Button variant={sharePrimary ? 'lime' : 'ghost'} disabled={!ready} onClick={share}>
						<Icon name="share" size={14} />
						compartilhar
					</Button>
				)}
				<Button variant={sharePrimary ? 'ghost' : 'lime'} disabled={!ready} onClick={download}>
					<Icon name="download" size={14} />
					baixar PNG
				</Button>
			</div>
		</>
	)
}
