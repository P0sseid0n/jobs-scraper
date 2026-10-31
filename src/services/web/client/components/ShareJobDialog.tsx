import { useId, useRef, useState } from 'react'

import { jobShareSubject, jobShareText, type ShareJob } from '@shared/templates'

import { useCoarsePointer } from '../lib/media'
import { useT } from '../stores/locale'
import { notify } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'
import { ShareJobImage } from './ShareJobImage'
import { Button } from './ui/Button'
import { Dialog, DialogTitle } from './ui/Dialog'
import { FieldHelp, FieldLabel } from './ui/Field'
import { IconButton } from './ui/IconButton'
import { field } from './ui/Input'
import { TabPanel, Tabs } from './ui/Tabs'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'

/** O compartilhamento nativo do sistema (celular e alguns desktops); sem ele, o botão nem aparece. */
const CAN_SHARE = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

type ShareFormat = 'text' | 'image'

const FORMATS: ShareFormat[] = ['text', 'image']

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
	const t = useT()
	const ref = useRef<HTMLDialogElement>(null)
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

	async function share() {
		try {
			await navigator.share({ text })
		} catch (error) {
			// Fechar a folha do sistema sem escolher um app não é erro
			if (!(error instanceof DOMException && error.name === 'AbortError')) notify(t.share.openFailed, 'error')
		}
	}

	const shareButton = (variant: 'ghost' | 'lime') => (
		<Button variant={variant} disabled={empty} onClick={share}>
			<Icon name="share" size={14} />
			{t.share.share}
		</Button>
	)

	return (
		<Dialog
			ref={ref}
			onClose={onClose}
			// Aberta, vira coluna: o meio rola e o topo e o rodapé ficam à vista. Larga para a prévia da imagem caber ao lado
			// das opções, e a mesma nas duas abas, para a modal não pular ao trocar. Ela mesma não rola: a aba que entra desce
			// 6px na animação e, com a modal na altura máxima, isso mostrava uma barra de rolagem a cada troca
			className="w-180 overflow-hidden open:flex open:flex-col"
		>
			<div className="flex flex-col gap-1 px-5 pt-4 pb-1">
				<DialogTitle closable>{t.share.title}</DialogTitle>
				<p className="m-0 min-w-0 truncate text-sm">
					<span className="font-semibold">{job.title}</span>
					{job.company && <span className="text-muted"> · {job.company}</span>}
				</p>
				<FieldHelp>{t.share.publicOnly}</FieldHelp>
			</div>
			<Tabs
				id={tabsId}
				label={t.share.format}
				items={FORMATS.map(value => ({ value, label: t.share.formats[value] }))}
				selected={format}
				onSelect={selectFormat}
				className="px-2"
			/>

			{/* Cada aba tem o seu meio, que rola, e o seu rodapé, com as ações daquele formato */}
			<TabPanel tabsId={tabsId} value="text" selected={format === 'text'} className="flex min-h-0 grow flex-col">
				<div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-5 py-4">
					<div className="flex flex-col gap-1.5">
						{/* Na linha do rótulo, o copiar só com o ícone (como nos campos do contato) e o "restaurar" depois de editar */}
						<div className="flex items-center justify-between gap-2">
							<FieldLabel htmlFor={textId}>{t.share.text}</FieldLabel>
							<div className="flex items-center gap-3">
								{text !== generated && (
									<TextLink size="xs" onClick={() => setText(generated)}>
										{t.share.restore}
									</TextLink>
								)}
								{!empty && (
									<CopyButton
										icon
										text={text}
										what={t.share.textWhat}
										label={t.share.copyText}
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
						<section aria-label={t.share.whatsappPreview} className="flex flex-col gap-2 rounded-sm bg-surface-2 p-3.5">
							<span className={LABEL}>{t.share.whatsappTitle}</span>
							<p className="m-0 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
								<WhatsAppText text={text} />
							</p>
						</section>
					)}

					<section className="flex flex-col gap-1.5" aria-label={t.share.sendVia}>
						<h3 className={LABEL}>{t.share.sendViaTitle}</h3>
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
								{t.share.email}
							</Button>
							{CAN_SHARE && !sharePrimary && shareButton('ghost')}
						</div>
					</section>
				</div>

				<div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
					<Button variant="ghost" onClick={() => ref.current?.close()}>
						{t.share.close}
					</Button>
					{sharePrimary ? (
						shareButton('lime')
					) : (
						<CopyButton variant="lime" text={text} what={t.share.textWhat} label={t.share.copyText} disabled={empty} />
					)}
				</div>
			</TabPanel>

			<TabPanel tabsId={tabsId} value="image" selected={format === 'image'} className="flex min-h-0 grow flex-col">
				{imageOpened && <ShareJobImage job={job} text={text} onClose={() => ref.current?.close()} />}
			</TabPanel>
		</Dialog>
	)
}

/** "Compartilhar vaga", só o ícone (no topo do detalhe, ao lado do "reportar"): abre a modal com o texto da vaga. */
export function ShareJobButton({ job, className }: { job: ShareJob; className?: string }) {
	const t = useT()
	const [open, setOpen] = useState(false)

	return (
		<>
			<IconButton
				label={t.share.shareJob}
				size="sm"
				variant="ghost"
				tone="ink"
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
