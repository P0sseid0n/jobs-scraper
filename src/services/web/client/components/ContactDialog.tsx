import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type MessageLength, type MessageTone } from '@shared/contracts'
import { defaultApplicationMessage, formatApplicationBody } from '@shared/templates'

import type { WebJob, WebMail } from '../../api-types'
import { cvPdfUrl, RequestError } from '../api'
import { cx } from '../lib/cx'
import { formatDateTime, MESSAGE_LENGTH_LABELS, MESSAGE_TONE_LABELS } from '../lib/format'
import { rewriteMessage, undoMessageRewrite, useCvFor, useGeneratedMessage, useReadyCvFor } from '../stores/cv'
import { sendApplication, useJobMails, useMailSetup } from '../stores/mail'
import { useMessageSignatureState } from '../stores/message-settings'
import { notify, type ToastAction } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { badge } from './ui/Badge'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { field, Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { PdfIcon } from './ui/PdfIcon'
import { Pill, PillGroup } from './ui/Pill'
import { LABEL } from './ui/text'
import { RouteLink, TextLink } from './ui/TextLink'

/** Uma das opções de reescrita da mensagem (tom, tamanho): o rótulo e as pills na mesma linha; no celular, um embaixo do outro. */
const MESSAGE_OPTION = 'flex items-center gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5'

type ContactJob = Pick<WebJob, 'postId' | 'title'>

type ContactDialogProps = {
	job: ContactJob
	/** Para quem vai a mensagem (o e-mail do recrutador). */
	recipient: string
	/**
	 * O destinatário só aparece, com o botão de copiar, e nunca muda. Sem ele, com a conta de e-mail configurada, o
	 * destinatário é um campo editável como os outros.
	 */
	recipientReadOnly?: boolean
	/** Um botão no aviso de que algo foi copiado (no detalhe da vaga, "marcar como enviada"). */
	copyAction?: ToastAction
	onClose: () => void
}

/**
 * O contato com o recrutador numa modal (`<dialog>` nativo: foco preso, Esc fecha): o destinatário, o assunto e a
 * mensagem (a gerada pela IA para a vaga, ou o modelo padrão), com as opções de reescrita e os botões de copiar.
 * Com a conta de e-mail (SMTP) configurada, o assunto e a mensagem viram campos editáveis e dá para enviar daqui, com o
 * currículo pronto anexado, só depois de clicar em "enviar"; sem ela, só copiar.
 */
export function ContactDialog({ job, recipient, recipientReadOnly = false, copyAction, onClose }: ContactDialogProps) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const ids = { to: useId(), subject: useId(), body: useId(), tone: useId(), length: useId() }

	const setup = useMailSetup()
	const mails = useJobMails(job.postId)
	const cv = useCvFor(job.postId)
	const readyCv = useReadyCvFor(job.postId)
	const { signature, status: signatureStatus, retry: retrySignature } = useMessageSignatureState()
	// Só com a assinatura lida (ou sem jeito de ler) e a conta de e-mail conhecida o texto é montado: assim a assinatura não
	// chega depois da edição, e a modal não troca de "só copiar" para editável na frente da pessoa
	const textReady = signatureStatus !== 'loading' && setup !== null
	const canSend = !!setup?.enabled
	const lastSent = mails.find(mail => mail.status === 'sent') ?? null
	const sending = mails[0]?.status === 'sending'

	// A mensagem gerada pela IA vem no lugar do modelo padrão, que continua a um clique
	const [useDefaultMessage, setUseDefaultMessage] = useState(false)
	const [rewriting, setRewriting] = useState<MessageTone | MessageLength | 'direct' | 'undo' | null>(null)
	const generatedRequest = useGeneratedMessage(job.postId)
	const generated = generatedRequest?.message ?? null
	const showGenerated = !!generated && !useDefaultMessage
	const message = generated && showGenerated ? generated : defaultApplicationMessage(job.title)
	// Mensagens de antes do tom e do tamanho foram escritas no neutro e no tamanho médio
	const tone = generated?.tone ?? 'neutral'
	const length = generated?.length ?? 'medium'
	const sourceBody = formatApplicationBody(message, signature)

	// O texto nos campos começa com a mensagem da IA (ou o modelo), com a assinatura. Quando ela muda por um pedido daqui
	// (reescrever, desfazer, trocar de modelo), o texto é trocado; quando muda sozinha (a mensagem da IA que chegou com o
	// currículo, a assinatura lida de novo), só se a pessoa ainda não editou: senão, fica a oferta de usar a nova
	const [to, setTo] = useState(recipient)
	const [subject, setSubject] = useState(message.subject)
	const [body, setBody] = useState(sourceBody)
	const [edited, setEdited] = useState(false)
	const [newerSource, setNewerSource] = useState(false)
	const adoptNext = useRef(false)
	useEffect(() => {
		if (!textReady) return
		if (edited && !adoptNext.current) {
			setNewerSource(true)
			return
		}

		adoptNext.current = false
		setSubject(message.subject)
		setBody(sourceBody)
		setEdited(false)
		setNewerSource(false)
	}, [message.subject, sourceBody, textReady])

	/** Troca o texto pela versão atual da mensagem (descarta o que foi editado). */
	function adoptSource() {
		setSubject(message.subject)
		setBody(sourceBody)
		setEdited(false)
		setNewerSource(false)
	}

	const [errors, setErrors] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState(false)
	const recipientFixed = recipientReadOnly || !canSend

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	/** Pede à IA outra versão da mensagem (ou desfaz a última); se ela não conseguir, a mensagem continua a mesma. */
	async function changeMessage(
		kind: NonNullable<typeof rewriting>,
		style: { tone: MessageTone; length: MessageLength; direct?: boolean } | null,
	) {
		if (!generatedRequest || rewriting) return

		setRewriting(kind)
		// Pedido daqui: a versão nova substitui o texto, mesmo editado (a modal avisa)
		adoptNext.current = true
		try {
			if (style) await rewriteMessage(generatedRequest.requestId, style)
			else await undoMessageRewrite(generatedRequest.requestId)
		} catch (error) {
			adoptNext.current = false
			notify(error instanceof RequestError ? error.message : 'Não consegui reescrever a mensagem', 'error')
		} finally {
			setRewriting(null)
		}
	}

	async function submit(event: FormEvent) {
		event.preventDefault()
		if (!canSend || !readyCv || !textReady) return

		setBusy(true)
		setErrors({})
		try {
			// O aviso de candidatura já enviada está na modal: confirmar aqui é confirmar o reenvio
			await sendApplication(job.postId, {
				requestId: readyCv.requestId,
				to: recipientFixed ? recipient : to,
				subject,
				body,
				force: !!lastSent,
			})
			notify('Candidatura a caminho: o status aparece no contato quando o e-mail sair')
			ref.current?.close()
		} catch (error) {
			if (error instanceof RequestError && Object.keys(error.fields).length > 0) setErrors(error.fields)
			else notify(error instanceof RequestError ? error.message : 'Não consegui enviar a candidatura', 'error')
			setBusy(false)
		}
	}

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className={cx(DIALOG, 'w-150')}
			aria-labelledby={titleId}
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && !busy && ref.current.close()}
		>
			<form className="flex flex-col gap-4 px-5 pt-4 pb-5" onSubmit={submit}>
				<div className="flex flex-col gap-1">
					<h2 className="text-lg font-bold" id={titleId}>
						Entrar em contato
					</h2>
					{setup &&
						(canSend ? (
							<FieldHelp>
								Revise e envie daqui{setup.from ? `, de ${setup.from}` : ''}, com o currículo anexado, ou copie para enviar
								pelo seu e-mail. Nada é enviado sem o clique em “enviar”.
							</FieldHelp>
						) : (
							<FieldHelp>
								Copie e envie pelo seu e-mail. Para editar e enviar daqui, com o currículo anexado, configure a conta de e-mail
								em{' '}
								<RouteLink className="text-sm" to="/configuracoes">
									Configurações › Contas
								</RouteLink>
								.
							</FieldHelp>
						))}
				</div>

				{lastSent && (
					<Notice tone="warn" icon="alert" className="text-sm">
						<p className="m-0">
							Esta vaga já recebeu sua candidatura por e-mail ({formatDateTime(lastSent.sentAt ?? lastSent.requestedAt)}, para{' '}
							{lastSent.to}). Enviar de novo manda outro e-mail.
						</p>
					</Notice>
				)}

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor={ids.to}>para</FieldLabel>
					{recipientFixed ? (
						// Só para ver e copiar: o destinatário é o contato da vaga
						<div className="flex min-w-0 items-center gap-2 rounded-sm border border-line py-1.5 pr-1.5 pl-3 text-sm">
							<output id={ids.to} className="block grow truncate font-mono">
								{recipient}
							</output>
							<CopyButton text={recipient} what="E-mail" toastAction={copyAction} />
						</div>
					) : (
						<>
							<Input
								id={ids.to}
								type="email"
								className="font-mono"
								value={to}
								invalid={!!errors.to}
								aria-describedby={errors.to ? `${ids.to}-error` : undefined}
								onChange={event => setTo(event.target.value)}
							/>
							{errors.to && <FieldError id={`${ids.to}-error`}>{errors.to}</FieldError>}
						</>
					)}
				</div>

				<section aria-label="Mensagem de candidatura" className="flex flex-col gap-3 rounded-sm bg-surface-2 p-3.5">
					<div className="flex items-center justify-between gap-3">
						<span className={LABEL}>{showGenerated ? 'mensagem gerada pela IA' : 'modelo de mensagem'}</span>
						{textReady && (
							<CopyButton text={body} what="Texto da mensagem" label="copiar mensagem" size="xs" toastAction={copyAction} />
						)}
					</div>

					{signatureStatus === 'failed' && (
						<Notice tone="warn" icon="alert" className="text-sm">
							<p className="m-0">
								Não consegui ler a assinatura das configurações: a mensagem está sem ela.{' '}
								<TextLink className="text-sm" onClick={retrySignature}>
									tentar de novo
								</TextLink>
							</p>
						</Notice>
					)}

					{newerSource && (
						<Notice tone="warn" icon="info" className="text-sm">
							<p className="m-0">
								A mensagem mudou enquanto você editava (chegou a da IA, ou a assinatura).{' '}
								<TextLink className="text-sm" onClick={adoptSource}>
									usar a nova
								</TextLink>{' '}
								troca o que você editou.
							</p>
						</Notice>
					)}

					<div
						className={cx('flex flex-col gap-3', rewriting && 'animate-pulse opacity-55 motion-reduce:animate-none')}
						aria-busy={!!rewriting || !textReady}
					>
						{!textReady ? (
							// Só um instante: a assinatura entra no texto antes de ele virar editável
							<p className="m-0 flex items-center gap-2 text-sm text-muted" role="status">
								<Icon name="spinner" size={14} />
								carregando a mensagem…
							</p>
						) : canSend ? (
							<>
								<div className="flex flex-col gap-1.5">
									<div className="flex items-center justify-between gap-2">
										<FieldLabel htmlFor={ids.subject}>assunto</FieldLabel>
										<CopyButton
											icon
											text={subject}
											what="Assunto"
											label="copiar assunto"
											className="text-muted hover:text-ink"
										/>
									</div>
									<Input
										id={ids.subject}
										value={subject}
										disabled={!!rewriting}
										invalid={!!errors.subject}
										aria-describedby={errors.subject ? `${ids.subject}-error` : undefined}
										onChange={event => {
											setSubject(event.target.value)
											setEdited(true)
										}}
									/>
									{errors.subject && <FieldError id={`${ids.subject}-error`}>{errors.subject}</FieldError>}
								</div>
								<div className="flex flex-col gap-1.5">
									<FieldLabel htmlFor={ids.body}>mensagem</FieldLabel>
									<textarea
										id={ids.body}
										rows={9}
										value={body}
										disabled={!!rewriting}
										aria-invalid={!!errors.body || undefined}
										aria-describedby={errors.body ? `${ids.body}-error` : undefined}
										onChange={event => {
											setBody(event.target.value)
											setEdited(true)
										}}
										className={field({ invalid: !!errors.body, className: 'resize-y py-2.5 leading-relaxed' })}
									/>
									{errors.body && <FieldError id={`${ids.body}-error`}>{errors.body}</FieldError>}
								</div>
							</>
						) : (
							<>
								<p className="m-0 text-sm leading-relaxed wrap-break-word">
									<span className={cx(LABEL, 'mr-2')}>assunto</span>
									<span className="font-semibold">{subject}</span>
									<CopyButton
										icon
										text={subject}
										what="Assunto"
										label="copiar assunto"
										className="ml-1 align-middle text-muted hover:text-ink"
									/>
								</p>
								{/* Texto corrido, para revisar: sem a fonte mono e com a linha numa largura confortável de ler */}
								<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{body}</p>
							</>
						)}
					</div>

					{showGenerated && (
						// Reescreve a mensagem já gerada: o tom e o tamanho escolhidos ficam ligados
						<div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-line-strong pt-3">
							<div className={MESSAGE_OPTION}>
								<span id={ids.tone} className={LABEL}>
									tom
								</span>
								<PillGroup role="group" aria-labelledby={ids.tone}>
									{MESSAGE_TONES.map(option => (
										<Pill
											key={option}
											pressed={option === tone}
											disabled={!!rewriting}
											onClick={() => option !== tone && changeMessage(option, { tone: option, length })}
										>
											{rewriting === option && <Icon name="spinner" size={13} />}
											{MESSAGE_TONE_LABELS[option]}
										</Pill>
									))}
								</PillGroup>
							</div>
							<div className={MESSAGE_OPTION}>
								<span id={ids.length} className={LABEL}>
									tamanho
								</span>
								<PillGroup role="group" aria-labelledby={ids.length}>
									{MESSAGE_LENGTHS.map(option => (
										<Pill
											key={option}
											pressed={option === length}
											disabled={!!rewriting}
											onClick={() => option !== length && changeMessage(option, { tone, length: option })}
										>
											{rewriting === option && <Icon name="spinner" size={13} />}
											{MESSAGE_LENGTH_LABELS[option]}
										</Pill>
									))}
								</PillGroup>
							</div>
							{/* Uma ação, não uma opção: cada clique reescreve de novo, mais enxuta */}
							<Button
								variant="ghost"
								size="sm"
								disabled={!!rewriting}
								onClick={() => changeMessage('direct', { tone, length, direct: true })}
							>
								<Icon name={rewriting === 'direct' ? 'spinner' : 'refresh'} size={13} />
								deixar mais direta
							</Button>
						</div>
					)}

					{/* Sem mensagem da IA, a área do currículo, abaixo, explica que ela vem com ele */}
					{generated && (
						<div className="flex items-center justify-between gap-3 text-muted text-xs">
							<span role="status">
								{rewriting && rewriting !== 'undo' ? (
									'a IA está reescrevendo…'
								) : showGenerated ? (
									<>
										{canSend ? 'reescrever troca o que você editou' : 'revise antes de enviar'}
										{generatedRequest?.previousMessage && (
											<>
												{' · '}
												<TextLink className="text-xs" disabled={!!rewriting} onClick={() => changeMessage('undo', null)}>
													desfazer
												</TextLink>
											</>
										)}
									</>
								) : (
									''
								)}
							</span>
							<TextLink
								className="text-xs"
								onClick={() => {
									// Pedido daqui: a outra versão substitui o texto, mesmo editado
									adoptNext.current = true
									setUseDefaultMessage(!useDefaultMessage)
								}}
							>
								{showGenerated ? 'usar o modelo padrão' : 'usar a mensagem da IA'}
							</TextLink>
						</div>
					)}
				</section>

				{/* O currículo é escolha de quem abriu: com ele vêm o anexo e a mensagem escrita pela IA para a vaga */}
				<section aria-label="Currículo" className="flex flex-col gap-2.5 rounded-sm border border-line p-2.5">
					{readyCv ? (
						<div className="flex items-center gap-3">
							<PdfIcon>PDF</PdfIcon>
							<div className="min-w-0 grow">
								<div className="text-sm font-semibold">{canSend ? 'anexo' : 'currículo'}</div>
								<div className="block truncate font-mono text-xs text-muted">{readyCv.fileName}</div>
							</div>
							<div className="flex flex-col items-end gap-1">
								<TextLink className="text-sm" href={cvPdfUrl(readyCv.requestId)} external>
									pré-visualizar
								</TextLink>
								{!canSend && (
									<TextLink
										className="text-sm"
										href={cvPdfUrl(readyCv.requestId, true)}
										download={readyCv.fileName ?? undefined}
									>
										baixar
									</TextLink>
								)}
							</div>
						</div>
					) : (
						<div className="flex flex-wrap items-center gap-3">
							<FieldHelp className="min-w-0 basis-60 grow text-xs">
								{cv?.status === 'pending'
									? 'Gerando o currículo ajustado para a vaga: a mensagem da IA chega junto.'
									: canSend
										? 'Gere o currículo ajustado para a vaga: ele vai anexado ao e-mail, e a IA escreve a mensagem junto.'
										: 'Gere o currículo ajustado para a vaga: a IA escreve a mensagem junto, e o PDF fica para você anexar.'}
								{cv?.status === 'failed' && <span className="block text-danger">O último falhou: {cv.error}</span>}
							</FieldHelp>
							<CvButton job={job} className="shrink-0" />
						</div>
					)}
				</section>

				<div className="flex justify-end gap-2 pt-1">
					<Button variant="ghost" type="button" disabled={busy} onClick={() => ref.current?.close()}>
						{canSend ? 'cancelar' : 'fechar'}
					</Button>
					{canSend && (
						<Button variant="lime" type="submit" disabled={busy || !readyCv || sending || !!rewriting || !textReady}>
							<Icon name={busy || sending ? 'spinner' : 'mail'} size={14} />
							{sending ? 'enviando…' : lastSent ? 'enviar de novo' : 'enviar candidatura'}
						</Button>
					)}
				</div>
			</form>
		</dialog>
	)
}

/** O status do último envio da vaga: enviando, enviada (com a data) ou falhou (com o motivo). */
export function MailStatus({ mail }: { mail: WebMail }) {
	return (
		<span role="status" className="text-xs">
			{mail.status === 'sending' && <span className="text-muted">enviando para {mail.to}…</span>}
			{mail.status === 'sent' && (
				<span className={badge({ tone: 'running' })}>
					<Icon name="check" size={13} />
					enviada para {mail.to} {formatDateTime(mail.sentAt ?? mail.requestedAt)}
					{mail.channel === 'discord' && ' (pelo Discord)'}
				</span>
			)}
			{mail.status === 'failed' && <span className="text-danger">o envio falhou: {mail.error ?? 'erro desconhecido'}</span>}
		</span>
	)
}

/**
 * "Entrar em contato", a ação principal da vaga com e-mail: abre a modal do contato, onde também se gera o currículo.
 */
export function JobContact({
	job,
	copyAction,
	className,
}: {
	job: ContactJob & { recruiterEmail: string }
	copyAction?: ToastAction
	className?: string
}) {
	const [open, setOpen] = useState(false)

	return (
		<>
			<Button variant="lime" size="lg" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
				<Icon name="mail" />
				entrar em contato
			</Button>
			{open && (
				<ContactDialog
					job={job}
					recipient={job.recruiterEmail}
					recipientReadOnly
					copyAction={copyAction}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	)
}

/** O status do último envio por e-mail da vaga, no detalhe; nada se ela nunca recebeu um. */
export function JobMailStatus({ postId }: { postId: string }) {
	const latest = useJobMails(postId)[0] ?? null
	return latest && <MailStatus mail={latest} />
}
