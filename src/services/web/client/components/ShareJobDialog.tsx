import { useEffect, useId, useRef, useState } from 'react'

import { jobShareSubject, jobShareText, type ShareJob } from '@shared/templates'

import { cx } from '../lib/cx'
import { useCoarsePointer } from '../lib/media'
import { notify } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'
import { ShareJobImage } from './ShareJobImage'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field } from './ui/Input'
import { TabPanel, Tabs } from './ui/Tabs'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'

/** O compartilhamento nativo do sistema (celular e alguns desktops); sem ele, o botão nem aparece. */
const CAN_SHARE = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

type ShareFormat = 'text' | 'image'

const FORMATS: { value: ShareFormat; label: string }[] = [
	{ value: 'text', label: 'texto' },
	{ value: 'image', label: 'imagem' },
]

/** O `*negrito*` do WhatsApp: um trecho entre asteriscos, sem quebra de linha. */
const BOLD = /\*([^*\n]+)\*/g

/** O texto como o WhatsApp mostra: o que está entre asteriscos vira negrito, sem eles. */
function WhatsAppText({ text }: { text: string }) {
	const parts = text.split(BOLD)
	// No `split` com grupo, os trechos ímpares são o miolo de cada `*…*`
	return parts.map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))
}

/**
 * Indicar a vaga a alguém, com os dados públicos dela (nada do jobs-scraper nem da pessoa), em duas abas. No texto:
 * editável, com a prévia de como chega, e os jeitos de mandar: WhatsApp, e-mail, o compartilhar do sistema e copiar,
 * todos com o texto como está no campo. Na imagem: o card da vaga em PNG, para status, stories e posts.
 */
export function ShareJobDialog({ job, onClose }: { job: ShareJob; onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const textId = useId()
	const generated = jobShareText(job)
	const [text, setText] = useState(generated)
	const empty = !text.trim()
	// No celular, o compartilhar do sistema é o jeito comum de mandar: vira a ação principal no lugar do copiar
	const coarse = useCoarsePointer()
	const sharePrimary = CAN_SHARE && coarse
	const tabsId = useId()
	const [format, setFormat] = useState<ShareFormat>('text')
	// A imagem só é montada quando a aba abre pela primeira vez: a modal abre leve
	const [imageOpened, setImageOpened] = useState(false)

	function selectFormat(value: ShareFormat) {
		setFormat(value)
		if (value === 'image') setImageOpened(true)
	}

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	async function share() {
		try {
			await navigator.share({ text })
		} catch (error) {
			// Fechar a folha do sistema sem escolher um app não é erro
			if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Não consegui abrir o compartilhamento', 'error')
		}
	}

	const shareButton = (variant: 'ghost' | 'lime') => (
		<Button variant={variant} disabled={empty} onClick={share}>
			<Icon name="share" size={14} />
			compartilhar
		</Button>
	)

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			// Aberta, vira coluna: o meio rola e o topo e o rodapé ficam à vista
			className={cx(DIALOG, 'w-140 open:flex open:flex-col')}
			aria-labelledby={titleId}
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<div className="flex flex-col gap-1 px-5 pt-4 pb-1">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-bold" id={titleId}>
						Compartilhar vaga
					</h2>
					<IconButton label="Fechar" size="sm" onClick={() => ref.current?.close()}>
						<Icon name="close" size={16} />
					</IconButton>
				</div>
				<p className="m-0 min-w-0 truncate text-sm">
					<span className="font-semibold">{job.title}</span>
					{job.company && <span className="text-muted"> · {job.company}</span>}
				</p>
				<FieldHelp>Só os dados públicos da vaga: quem recebe não precisa do jobs-scraper.</FieldHelp>
			</div>
			<Tabs id={tabsId} label="Formato" items={FORMATS} selected={format} onSelect={selectFormat} className="px-2" />

			{/* Cada aba tem o seu meio, que rola, e o seu rodapé, com as ações daquele formato */}
			<TabPanel tabsId={tabsId} value="text" selected={format === 'text'} className="flex min-h-0 grow flex-col">
				<div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-5 py-4">
					<div className="flex flex-col gap-1.5">
						{/* Na linha do rótulo, o copiar só com o ícone (como nos campos do contato) e o "restaurar" depois de editar */}
						<div className="flex items-center justify-between gap-2">
							<FieldLabel htmlFor={textId}>texto</FieldLabel>
							<div className="flex items-center gap-3">
								{text !== generated && (
									<TextLink className="text-xs" onClick={() => setText(generated)}>
										restaurar texto
									</TextLink>
								)}
								{!empty && (
									<CopyButton
										icon
										text={text}
										what="Texto da vaga"
										label="copiar texto"
										className="text-muted hover:text-ink"
									/>
								)}
							</div>
						</div>
						{/* Cresce com o texto, até um limite: depois disso, rola */}
						<textarea
							id={textId}
							value={text}
							onChange={event => setText(event.target.value)}
							className={field({ multiline: true, grow: true })}
						/>
					</div>

					{!empty && (
						// A mesma caixa das prévias do editor do modelo de mensagem
						<section aria-label="Prévia no WhatsApp" className="flex flex-col gap-2 rounded-sm bg-surface-2 p-3.5">
							<span className={LABEL}>como chega no whatsapp</span>
							<p className="m-0 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
								<WhatsAppText text={text} />
							</p>
						</section>
					)}

					<section className="flex flex-col gap-1.5" aria-label="Enviar por">
						<h3 className={LABEL}>enviar por</h3>
						<div className="flex flex-wrap gap-2">
							<Button variant="ghost" href={`https://wa.me/?text=${encodeURIComponent(text)}`} external externalIcon={false}>
								<Icon name="chat" size={14} />
								WhatsApp
							</Button>
							<Button
								variant="ghost"
								href={`mailto:?subject=${encodeURIComponent(jobShareSubject(job))}&body=${encodeURIComponent(text)}`}
							>
								<Icon name="mail" size={14} />
								e-mail
							</Button>
							{CAN_SHARE && !sharePrimary && shareButton('ghost')}
						</div>
					</section>
				</div>

				<div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
					<Button variant="ghost" onClick={() => ref.current?.close()}>
						fechar
					</Button>
					{sharePrimary ? (
						shareButton('lime')
					) : (
						<CopyButton variant="lime" text={text} what="Texto da vaga" label="copiar texto" disabled={empty} />
					)}
				</div>
			</TabPanel>

			<TabPanel tabsId={tabsId} value="image" selected={format === 'image'} className="flex min-h-0 grow flex-col">
				{imageOpened && <ShareJobImage job={job} text={text} onClose={() => ref.current?.close()} />}
			</TabPanel>
		</dialog>
	)
}

/** "Compartilhar vaga", só o ícone (no topo do detalhe, ao lado do "reportar"): abre a modal com o texto da vaga. */
export function ShareJobButton({ job, className }: { job: ShareJob; className?: string }) {
	const [open, setOpen] = useState(false)

	return (
		<>
			<IconButton
				label="compartilhar vaga"
				size="sm"
				bordered
				className={className}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
			>
				<Icon name="share" size={15} />
			</IconButton>
			{open && <ShareJobDialog job={job} onClose={() => setOpen(false)} />}
		</>
	)
}
