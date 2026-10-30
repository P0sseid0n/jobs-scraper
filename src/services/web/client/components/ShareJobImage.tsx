import { getFontEmbedCSS, toBlob } from 'html-to-image'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import { jobShareCard, jobShareFileName, type ShareJob } from '@shared/templates'

import { cx } from '../lib/cx'
import { useCoarsePointer } from '../lib/media'
import { useStore } from '../lib/store'
import { shareImagePrefs, type ShareImagePrefs } from '../stores/share-image'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { SHARE_CARD_SIZES, ShareJobCard, type ShareCardFormat, type ShareCardTheme, type ShareCardTitleSize } from './ShareJobCard'
import { Button } from './ui/Button'
import { ImageThumb } from './ui/ImageThumb'
import { ImageViewer } from './ui/ImageViewer'
import { Pill, PILL_COUNT, PillGroup } from './ui/Pill'
import { SwitchField } from './ui/Switch'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'

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

/** Quanto esperar depois da última troca de opção para montar o PNG: cliques seguidos montam uma vez só. */
const GENERATE_DELAY_MS = 250

// O rótulo ao lado das pills (como o tom e o tamanho da modal de contato), numa coluna da mesma largura: a coluna de
// opções fica baixa o bastante para a modal não rolar numa tela de notebook
const OPTION = 'flex items-center gap-3'
const OPTION_LABEL = cx(LABEL, 'w-14 shrink-0')

/**
 * A imagem da vaga, para status, stories e posts: o tema, o formato e o que aparece nela, a prévia e os jeitos de levar:
 * baixar, copiar e o compartilhar do sistema (com o texto da modal junto). A prévia é o próprio card, encolhido, e muda na
 * hora; o PNG é montado dele no navegador logo depois, para estar pronto no clique: o copiar e o compartilhar precisam do
 * clique ainda fresco.
 */
export function ShareJobImage({ job, text, onClose }: { job: ShareJob; text: string; onClose: () => void }) {
	const ids = {
		theme: useId(),
		format: useId(),
		titleSize: useId(),
		qr: useId(),
		skills: useId(),
		description: useId(),
	}
	// Começa no tema que está na tela; trocar aqui não muda o do site
	const [theme, setTheme] = useState<ShareCardTheme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
	const prefs = useStore(shareImagePrefs)
	const { format, titleSize, qr, skills, description } = prefs
	const choose = (next: Partial<ShareImagePrefs>) => shareImagePrefs.set(current => ({ ...current, ...next }))
	const card = jobShareCard(job, { qr, skills, description })
	// O que a vaga tem para mostrar, com as opções ligadas: sem link público, tecnologias ou texto, a opção fica apagada
	const available = jobShareCard(job, { qr: true, skills: true, description: true })

	const node = useRef<HTMLDivElement>(null)
	const [zoomed, setZoomed] = useState(false)
	const fontCss = useRef<Promise<string>>(undefined)
	const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
	const [generating, setGenerating] = useState(true)
	const [failed, setFailed] = useState(false)
	// Muda a cada "tentar de novo", para montar o PNG outra vez com as mesmas opções
	const [attempt, setAttempt] = useState(0)
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

		const timer = setTimeout(() => {
			generate().catch(() => {
				if (stale) return
				fontCss.current = undefined
				setFailed(true)
				setGenerating(false)
			})
		}, GENERATE_DELAY_MS)

		return () => {
			stale = true
			clearTimeout(timer)
		}
	}, [theme, format, titleSize, qr, skills, description, attempt])

	// A imagem anterior (e a última, ao fechar) sai da memória
	useEffect(
		() => () => {
			if (image) URL.revokeObjectURL(image.url)
		},
		[image],
	)

	// A escala da prévia: lado a lado, o card fica com a altura toda da coluna de opções, sem passar da altura que a modal
	// tem (numa tela baixa, a prévia não faz o meio rolar); empilhados (no celular), com a largura toda
	const body = useRef<HTMLDivElement>(null)
	const row = useRef<HTMLDivElement>(null)
	const options = useRef<HTMLDivElement>(null)
	const [scale, setScale] = useState(0)
	const size = SHARE_CARD_SIZES[format]

	useLayoutEffect(() => {
		if (!body.current || !row.current || !options.current) return
		const [bodyElement, rowElement, optionsElement] = [body.current, row.current, options.current]
		const measure = () => {
			// Com a aba escondida, tudo mede 0: a escala fica a da última vez que a aba estava aberta
			if (optionsElement.offsetHeight === 0) return
			if (getComputedStyle(rowElement).flexDirection === 'column') return setScale(rowElement.clientWidth / size.width)

			const { paddingTop, paddingBottom } = getComputedStyle(bodyElement)
			const room = bodyElement.clientHeight - Number.parseFloat(paddingTop) - Number.parseFloat(paddingBottom)
			const height = room > 0 ? Math.min(optionsElement.offsetHeight, room) : optionsElement.offsetHeight
			setScale(height / size.height)
		}
		const observer = new ResizeObserver(measure)
		observer.observe(bodyElement)
		observer.observe(rowElement)
		observer.observe(optionsElement)
		measure()
		return () => observer.disconnect()
	}, [size])

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
			<div ref={body} className="flex min-h-0 grow flex-col overflow-y-auto px-5 py-4">
				{/* No celular, a prévia fica em cima, com a largura toda, e as opções embaixo */}
				<div ref={row} className="flex items-start gap-5 max-sm:flex-col">
					{/*
					 * A prévia já é a imagem pronta (o card desenhado na hora): enquanto o PNG é montado por trás, só os botões
					 * esperam, sem nada por cima dela
					 */}
					<ImageThumb
						label="ver a imagem maior"
						className="shrink-0 rounded-sm ring-1 ring-line"
						style={{ width: size.width * scale, height: size.height * scale }}
						disabled={!ready}
						onOpen={() => setZoomed(true)}
					>
						{/* O card no tamanho do PNG, encolhido: o PNG sai dele (a escala é do contêiner, não entra na imagem) */}
						<div
							className="origin-top-left"
							style={{ transform: `scale(${scale})` }}
							role="img"
							aria-label={`Prévia da imagem da vaga ${card.title}`}
						>
							<ShareJobCard ref={node} card={card} theme={theme} format={format} titleSize={titleSize} />
						</div>
					</ImageThumb>

					<div ref={options} className="flex min-w-0 grow flex-col gap-3.5 max-sm:w-full">
						<div className={OPTION}>
							<span id={ids.theme} className={OPTION_LABEL}>
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
							<span id={ids.format} className={OPTION_LABEL}>
								formato
							</span>
							<PillGroup role="group" aria-labelledby={ids.format}>
								{FORMATS.map(option => (
									<Pill key={option.value} pressed={option.value === format} onClick={() => choose({ format: option.value })}>
										{option.label}
										<span className={PILL_COUNT}>{option.ratio}</span>
									</Pill>
								))}
							</PillGroup>
						</div>
						<div className={OPTION}>
							<span id={ids.titleSize} className={OPTION_LABEL}>
								título
							</span>
							<PillGroup role="group" aria-labelledby={ids.titleSize}>
								{TITLE_SIZES.map(option => (
									<Pill
										key={option.value}
										pressed={option.value === titleSize}
										onClick={() => choose({ titleSize: option.value })}
									>
										{option.label}
									</Pill>
								))}
							</PillGroup>
						</div>
						{/* Como a imagem é (acima) e o que entra nela (aqui) */}
						<fieldset className="flex flex-col gap-3 text-sm">
							{/* A legenda fica fora do `gap` do fieldset: a margem dá o mesmo espaço dos outros rótulos */}
							<legend className={cx(LABEL, 'mb-1.5 p-0')}>mostrar</legend>
							<SwitchField
								id={ids.qr}
								title="QR code"
								description={available.qr ? undefined : 'a vaga não tem link público'}
								checked={qr && available.qr !== null}
								disabled={available.qr === null}
								onChange={value => choose({ qr: value })}
							/>
							<SwitchField
								id={ids.skills}
								title="tecnologias"
								description={available.skills.length === 0 ? 'a vaga não lista tecnologias' : undefined}
								checked={skills && available.skills.length > 0}
								disabled={available.skills.length === 0}
								onChange={value => choose({ skills: value })}
							/>
							<SwitchField
								id={ids.description}
								title="descrição"
								description={available.description === null ? 'a vaga não tem texto' : undefined}
								checked={description && available.description !== null}
								disabled={available.description === null}
								onChange={value => choose({ description: value })}
							/>
						</fieldset>
						{failed && (
							<p role="alert" className="m-0 text-xs text-danger">
								Não consegui montar a imagem.{' '}
								<TextLink size="xs" onClick={() => setAttempt(current => current + 1)}>
									tentar de novo
								</TextLink>
							</p>
						)}
					</div>
				</div>

				{/* A imagem ampliada é o próprio PNG (o arquivo só existe na página: sem "abrir original") */}
				{zoomed && image && (
					<ImageViewer
						images={[{ src: image.url, alt: `Imagem da vaga ${card.title}` }]}
						original={false}
						onClose={() => setZoomed(false)}
					/>
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
				{/* A primeira montagem busca as fontes e demora uns segundos: o botão diz que está preparando; as outras são rápidas */}
				<Button variant={sharePrimary ? 'ghost' : 'lime'} disabled={!ready} aria-busy={generating} onClick={download}>
					<Icon name="download" size={14} />
					{image === null && generating ? 'preparando…' : 'baixar PNG'}
				</Button>
			</div>
		</>
	)
}
