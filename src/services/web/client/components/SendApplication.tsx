import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { formatApplicationBody, type ApplicationMessageText } from '@shared/templates'

import type { WebCvRequest, WebJob, WebMail } from '../../api-types'
import { cvPdfUrl, RequestError } from '../api'
import { cx } from '../lib/cx'
import { formatDateTime } from '../lib/format'
import { useReadyCvFor } from '../stores/cv'
import { sendApplication, useJobMails, useMailSetup } from '../stores/mail'
import { useMessageSignature } from '../stores/message-settings'
import { notify } from '../stores/toast'
import { Icon } from './Icon'
import { badge } from './ui/Badge'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { field, Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { PdfIcon } from './ui/PdfIcon'
import { RouteLink, TextLink } from './ui/TextLink'

/**
 * Enviar a candidatura por e-mail daqui: o botão abre a prévia editável (destinatário, assunto, corpo e o PDF anexo) e
 * só envia depois de confirmar. Mostra o status do último envio da vaga. Sem conta de e-mail, diz onde configurar.
 */
export function SendApplication({
	job,
	message,
}: {
	job: Pick<WebJob, 'postId' | 'recruiterEmail'>
	message: ApplicationMessageText
}) {
	const setup = useMailSetup()
	const mails = useJobMails(job.postId)
	const cv = useReadyCvFor(job.postId)
	const [previewing, setPreviewing] = useState(false)

	if (!setup || !job.recruiterEmail) return null

	if (!setup.enabled) {
		return (
			<FieldHelp className="text-xs">
				Para enviar a candidatura daqui, com o currículo anexado, configure a conta de e-mail em{' '}
				<RouteLink className="text-xs" to="/configuracoes">
					Configurações › Contas
				</RouteLink>
				.
			</FieldHelp>
		)
	}

	const latest = mails[0] ?? null
	const lastSent = mails.find(mail => mail.status === 'sent') ?? null
	const sending = latest?.status === 'sending'

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<Button variant="lime" size="sm" disabled={!cv || sending} aria-haspopup="dialog" onClick={() => setPreviewing(true)}>
					<Icon name={sending ? 'spinner' : 'mail'} size={13} />
					{sending ? 'enviando…' : latest?.status === 'failed' ? 'tentar de novo' : 'enviar candidatura'}
				</Button>
				{!cv && <FieldHelp className="text-xs">Gere o currículo para anexá-lo à candidatura.</FieldHelp>}
				{latest && <MailStatus mail={latest} />}
			</div>
			{previewing && cv && (
				<SendApplicationDialog
					job={job}
					cv={cv}
					from={setup.from}
					message={message}
					lastSent={lastSent}
					onClose={() => setPreviewing(false)}
				/>
			)}
		</div>
	)
}

/** O status do último envio: enviando, enviada (com a data) ou falhou (com o motivo). */
function MailStatus({ mail }: { mail: WebMail }) {
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
 * A prévia do e-mail (`<dialog>` nativo: foco preso, Esc fecha): tudo editável, o PDF anexo visível e, se a vaga já
 * recebeu candidatura, o aviso antes de mandar de novo. Nada sai sem o clique em "enviar".
 */
function SendApplicationDialog({
	job,
	cv,
	from,
	message,
	lastSent,
	onClose,
}: {
	job: Pick<WebJob, 'postId' | 'recruiterEmail'>
	cv: WebCvRequest
	from: string | null
	message: ApplicationMessageText
	lastSent: WebMail | null
	onClose: () => void
}) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const ids = { to: useId(), subject: useId(), body: useId() }
	const signature = useMessageSignature()

	const [to, setTo] = useState(job.recruiterEmail ?? '')
	const [subject, setSubject] = useState(message.subject)
	const [body, setBody] = useState(() => formatApplicationBody(message, signature))
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	async function submit(event: FormEvent) {
		event.preventDefault()
		setBusy(true)
		setErrors({})

		try {
			// O aviso de candidatura já enviada está na prévia: confirmar aqui é confirmar o reenvio
			await sendApplication(job.postId, { requestId: cv.requestId, to, subject, body, force: !!lastSent })
			notify('Candidatura a caminho: o status aparece aqui quando o e-mail sair')
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
			onClick={event => event.target === ref.current && !busy && ref.current.close()}
		>
			<form className="flex flex-col gap-4 px-5 pt-4 pb-5" onSubmit={submit}>
				<div className="flex flex-col gap-1">
					<h2 className="text-lg font-bold" id={titleId}>
						Enviar candidatura
					</h2>
					<FieldHelp>
						Revise antes de enviar{from ? `: sai de ${from}` : ''}. O e-mail só é enviado quando você confirmar.
					</FieldHelp>
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
				</div>

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor={ids.subject}>assunto</FieldLabel>
					<Input
						id={ids.subject}
						value={subject}
						invalid={!!errors.subject}
						aria-describedby={errors.subject ? `${ids.subject}-error` : undefined}
						onChange={event => setSubject(event.target.value)}
					/>
					{errors.subject && <FieldError id={`${ids.subject}-error`}>{errors.subject}</FieldError>}
				</div>

				<div className="flex flex-col gap-1.5">
					<FieldLabel htmlFor={ids.body}>mensagem</FieldLabel>
					<textarea
						id={ids.body}
						rows={10}
						value={body}
						aria-invalid={!!errors.body || undefined}
						aria-describedby={errors.body ? `${ids.body}-error` : undefined}
						onChange={event => setBody(event.target.value)}
						className={field({ invalid: !!errors.body, className: 'resize-y py-2.5 leading-relaxed' })}
					/>
					{errors.body && <FieldError id={`${ids.body}-error`}>{errors.body}</FieldError>}
				</div>

				<div className="flex items-center gap-3 rounded-sm bg-surface-2 p-2.5">
					<PdfIcon>PDF</PdfIcon>
					<div className="min-w-0 grow">
						<div className="text-sm font-semibold">anexo</div>
						<div className="block truncate font-mono text-xs text-muted">{cv.fileName}</div>
					</div>
					<TextLink className="text-sm" href={cvPdfUrl(cv.requestId)} external>
						pré-visualizar
					</TextLink>
				</div>

				<div className="flex justify-end gap-2 pt-1">
					<Button variant="ghost" type="button" disabled={busy} onClick={() => ref.current?.close()}>
						cancelar
					</Button>
					<Button variant="lime" type="submit" disabled={busy}>
						<Icon name={busy ? 'spinner' : 'mail'} size={14} />
						{lastSent ? 'enviar de novo' : 'enviar candidatura'}
					</Button>
				</div>
			</form>
		</dialog>
	)
}
