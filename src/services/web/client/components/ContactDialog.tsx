import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type MessageLength, type MessageTone } from '@shared/contracts'
import { DEFAULT_TEMPLATE, templateMessage, unresolvedMissing } from '@shared/templates'

import type { WebJob, WebMail } from '../../api-types'
import { api, cvPdfUrl, RequestError } from '../api'
import { cx } from '../lib/cx'
import { formatDateTime, MESSAGE_LENGTH_LABELS, MESSAGE_TONE_LABELS } from '../lib/format'
import { useCvFor, useReadyCvFor } from '../stores/cv'
import { sendApplication, useJobMails, useMailSetup } from '../stores/mail'
import { useMessageSettingsState } from '../stores/message-settings'
import { notify, type ToastAction } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { CvButton } from './CvButton'
import { Icon } from './Icon'
import { badge } from './ui/Badge'
import { Button } from './ui/Button'
import { DIALOG } from './ui/Dialog'
import { Disclosure } from './ui/Disclosure'
import { FieldError, FieldHelp, FieldLabel } from './ui/Field'
import { FieldScan } from './ui/FieldScan'
import { IconButton } from './ui/IconButton'
import { field, Input } from './ui/Input'
import { Notice } from './ui/Notice'
import { PdfIcon } from './ui/PdfIcon'
import { Pill, PillGroup } from './ui/Pill'
import { LABEL } from './ui/text'
import { RouteLink, TextLink } from './ui/TextLink'

/** Uma das opções do "melhorar com a IA" (tom, tamanho): o rótulo e as pills na mesma linha; no celular, um embaixo do outro. */
const MESSAGE_OPTION = 'flex items-center gap-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5'

/** A vaga: o id e os dados que preenchem as variáveis do modelo (`{{empresa}}`, `{{local}}`…). */
type ContactJob = Pick<
	WebJob,
	'postId' | 'title' | 'company' | 'location' | 'workMode' | 'necessaryKnowledge' | 'applyLink' | 'postLink' | 'author'
>

const LIST_FORMAT = new Intl.ListFormat('pt-BR')

/** Os nomes como aparecem no modelo: "{{empresa}} e {{local}}". */
function variableList(names: readonly string[]) {
	return LIST_FORMAT.format(names.map(name => `{{${name}}}`))
}

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
 * mensagem (o modelo da pessoa, preenchido na hora com os dados da vaga), o "melhorar com a IA" e os botões de copiar.
 * Avisa o que a vaga não tinha (o que usou o fallback e o que ficou marcado no texto).
 * Com a conta de e-mail (SMTP) configurada, o assunto e a mensagem viram campos editáveis e dá para enviar daqui, com o
 * currículo pronto anexado, só depois de clicar em "enviar"; sem ela, só copiar.
 */
export function ContactDialog({ job, recipient, recipientReadOnly = false, copyAction, onClose }: ContactDialogProps) {
	const ref = useRef<HTMLDialogElement>(null)
	const titleId = useId()
	const ids = {
		to: useId(),
		subject: useId(),
		body: useId(),
		fallbacks: useId(),
		tone: useId(),
		length: useId(),
		blocker: useId(),
	}

	const setup = useMailSetup()
	const mails = useJobMails(job.postId)
	const cv = useCvFor(job.postId)
	const readyCv = useReadyCvFor(job.postId)
	const { settings: messageSettings, profile, status: settingsStatus, retry: retrySettings } = useMessageSettingsState()
	// Só com o modelo lido (ou sem jeito de ler) e a conta de e-mail conhecida o texto é montado: assim o modelo não chega
	// depois da edição, e a modal não troca de "só copiar" para editável na frente da pessoa
	const textReady = settingsStatus !== 'loading' && setup !== null
	const canSend = !!setup?.enabled
	const lastSent = mails.find(mail => mail.status === 'sent') ?? null
	const sending = mails[0]?.status === 'sending'

	const [rewriting, setRewriting] = useState(false)
	// O estilo do "melhorar com a IA", escolhido na hora
	const [tone, setTone] = useState<MessageTone>('neutral')
	const [length, setLength] = useState<MessageLength>('medium')
	// Sem as configurações (a leitura falhou), vale o modelo padrão
	const message = templateMessage(messageSettings ?? { template: DEFAULT_TEMPLATE, fallbacks: {}, variables: [] }, job, profile ?? {})
	const sourceBody = message.body

	// O texto nos campos começa com o modelo preenchido. Quando ele muda sozinho (as configurações lidas de novo), o texto
	// só é trocado se a pessoa ainda não editou: senão, fica a oferta de usar o novo
	const [to, setTo] = useState(recipient)
	const [subject, setSubject] = useState(message.subject)
	const [body, setBody] = useState(sourceBody)
	const [edited, setEdited] = useState(false)
	const [newerSource, setNewerSource] = useState(false)
	useEffect(() => {
		if (!textReady) return
		if (edited) {
			setNewerSource(true)
			return
		}

		setSubject(message.subject)
		setBody(sourceBody)
		setEdited(false)
		setNewerSource(false)
	}, [message.subject, sourceBody, textReady])

	// O corpo fica carregando enquanto os dados não chegam (o modelo e a conta de e-mail). Os campos esperando (dados
	// chegando ou a IA reescrevendo) ficam só de leitura, com o `FieldScan` no corpo, e não desligados: o visual de
	// desligado é para o que não se pode usar, não para o que ainda está chegando
	const bodyLoading = !textReady
	const fieldsBusy = bodyLoading || !!rewriting
	const busyLabel = rewriting ? 'a IA está reescrevendo a mensagem…' : 'carregando a mensagem…'
	// Sem saber ainda se há conta de e-mail, os campos aparecem como editáveis (desligados), no lugar em que vão ficar
	const editable = canSend || setup === null

	/** Troca o texto pela versão atual da mensagem (descarta o que foi editado). */
	function adoptSource() {
		setSubject(message.subject)
		setBody(sourceBody)
		setEdited(false)
		setNewerSource(false)
		setBeforeImprove(null)
	}

	// O que a vaga não tinha e o modelo não tem fallback: fica marcado no texto (`[empresa]`), e o envio espera a pessoa
	// completar ou apagar o trecho
	const unresolved = unresolvedMissing(message.missing, subject, body)
	// O corpo antes do "melhorar com a IA", para desfazer
	const [beforeImprove, setBeforeImprove] = useState<string | null>(null)

	const [errors, setErrors] = useState<Record<string, string>>({})
	const [busy, setBusy] = useState(false)
	const recipientFixed = recipientReadOnly || !canSend

	// Por que o "enviar" está desligado, ao lado dele: o primeiro motivo que a pessoa pode resolver. Carregando ou
	// enviando, não há o que explicar
	const sendBlocker = !canSend || bodyLoading
		? null
		: rewriting
			? 'Espere a IA terminar de reescrever.'
			: unresolved.length > 0
				? `Troque ${LIST_FORMAT.format(unresolved.map(name => `[${name}]`))} no texto para enviar.`
				: !readyCv
					? cv?.status === 'pending'
						? 'O currículo ainda está sendo gerado: ele vai anexado.'
						: 'Gere o currículo para enviar: ele vai anexado.'
					: null

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	// O que entrou pelo fallback não pede nada: só uma nota embaixo da mensagem
	const hasFallbacks = textReady && message.fallbacks.length > 0
	const fallbackNote = hasFallbacks && (
		<FieldHelp id={ids.fallbacks} className="text-xs">
			A vaga não tem {variableList(message.fallbacks)}: entrou o texto do fallback.
		</FieldHelp>
	)

	/**
	 * "Melhorar com a IA": reescreve o texto atual no tom e no tamanho escolhidos. Nada é guardado: a versão nova só
	 * fica nos campos, e "desfazer" volta à de antes.
	 */
	async function improveMessage() {
		if (rewriting) return

		setRewriting(true)
		try {
			const improved = await api.improveJobMessage(job.postId, { body, tone, length })
			setBeforeImprove(body)
			setBody(improved.body)
			setEdited(true)
		} catch (error) {
			notify(error instanceof RequestError ? error.message : 'Não consegui melhorar a mensagem', 'error')
		} finally {
			setRewriting(false)
		}
	}

	/** O que a pessoa escreve no corpo: depois disso, o "desfazer" da IA perderia a edição, então ele sai. */
	function editBody(value: string) {
		setBody(value)
		setEdited(true)
		setBeforeImprove(null)
	}

	async function submit(event: FormEvent) {
		event.preventDefault()
		if (!canSend || !readyCv || bodyLoading || unresolved.length > 0) return

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
			// Aberta, vira coluna: o meio rola e o topo e o rodapé (com o "enviar") ficam à vista
			className={cx(DIALOG, 'w-180 open:flex open:flex-col')}
			aria-labelledby={titleId}
			onClose={onClose}
			// Enviando, nem o Esc nem o clique no fundo escurecido (fora do conteúdo) fecham
			onCancel={event => busy && event.preventDefault()}
			onClick={event => event.target === ref.current && !busy && ref.current.close()}
		>
			<div className="flex flex-col gap-1 border-b border-line px-5 pt-4 pb-3.5">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-lg font-bold" id={titleId}>
						Entrar em contato
					</h2>
					<IconButton label="Fechar" size="sm" disabled={busy} onClick={() => ref.current?.close()}>
						<Icon name="close" size={16} />
					</IconButton>
				</div>
				{/* A vaga, para não mandar a mensagem certa para a vaga errada */}
				<p className="m-0 min-w-0 truncate text-sm">
					<span className="font-semibold">{job.title}</span>
					{job.company && <span className="text-muted"> · {job.company}</span>}
				</p>
				{setup &&
					(canSend ? (
						<FieldHelp>
							Revise e envie daqui{setup.from ? `, de ${setup.from}` : ''}, com o currículo anexado, ou copie para enviar pelo
							seu e-mail. Nada é enviado sem o clique em “enviar”.
						</FieldHelp>
					) : (
						<FieldHelp>
							Copie e envie pelo seu e-mail. Para editar e enviar daqui, com o currículo anexado, configure a conta de e-mail em{' '}
							<RouteLink className="text-sm" to="/configuracoes" search={{ conta: 'smtp' }} hash="contas">
								Configurações › Contas
							</RouteLink>
							.
						</FieldHelp>
					))}
			</div>

			<form className="flex min-h-0 grow flex-col" onSubmit={submit}>
				<div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-5 py-4">
					{lastSent && (
						<Notice tone="warn" icon="alert" className="text-sm">
							<p className="m-0">
								Esta vaga já recebeu sua candidatura por e-mail ({formatDateTime(lastSent.sentAt ?? lastSent.requestedAt)}, para{' '}
								{lastSent.to}). Enviar de novo manda outro e-mail.
							</p>
						</Notice>
					)}

					<div className="flex flex-col gap-1.5">
						{/* Cada campo tem o botão de copiar só com o ícone, na linha do rótulo */}
						<div className="flex items-center justify-between gap-2">
							<FieldLabel htmlFor={ids.to}>para</FieldLabel>
							{recipientFixed && (
								<CopyButton
									icon
									text={recipient}
									what="E-mail"
									label="copiar e-mail"
									toastAction={copyAction}
									className="text-muted hover:text-ink"
								/>
							)}
						</div>
						{recipientFixed ? (
							// Só para ver e copiar: o destinatário é o contato da vaga
							<div className="flex min-h-11 min-w-0 items-center rounded-sm border border-line px-3 text-sm">
								<output id={ids.to} className="block truncate font-mono">
									{recipient}
								</output>
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
						{/* Em caixa, só o que pede uma ação: o que ficou marcado no texto (e segura o envio), o modelo que não deu para
						 * ler e o modelo que mudou. O que entrou pelo fallback é só uma nota embaixo da mensagem */}
						{textReady && unresolved.length > 0 && (
							<Notice tone="warn" icon="alert" className="text-sm">
								<p className="m-0">
									A vaga não tem {variableList(unresolved)}, e o modelo não tem fallback: troque{' '}
									{LIST_FORMAT.format(unresolved.map(name => `[${name}]`))} no texto antes de enviar. Para as próximas vagas,
									defina um fallback em{' '}
									<RouteLink className="text-sm" to="/configuracoes" hash="mensagem">
										Configurações › Mensagem
									</RouteLink>
									.
								</p>
							</Notice>
						)}

						{settingsStatus === 'failed' && (
							<Notice tone="warn" icon="alert" className="text-sm">
								<p className="m-0">
									Não consegui ler o seu modelo das configurações: a mensagem saiu do modelo padrão.{' '}
									<TextLink className="text-sm" onClick={retrySettings}>
										tentar de novo
									</TextLink>
								</p>
							</Notice>
						)}

						{newerSource && (
							<Notice tone="warn" icon="info" className="text-sm">
								<p className="m-0">
									O modelo mudou enquanto você editava.{' '}
									<TextLink className="text-sm" onClick={adoptSource}>
										usar a nova
									</TextLink>{' '}
									troca o que você editou.
								</p>
							</Notice>
						)}

						<div className="flex flex-col gap-3" aria-busy={fieldsBusy}>
							{editable ? (
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
											readOnly={fieldsBusy}
											aria-busy={fieldsBusy}
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
										<div className="flex items-center justify-between gap-2">
											<FieldLabel htmlFor={ids.body}>mensagem</FieldLabel>
											{!bodyLoading && (
												<CopyButton
													icon
													text={body}
													what="Texto da mensagem"
													label="copiar mensagem"
													toastAction={copyAction}
													className="text-muted hover:text-ink"
												/>
											)}
										</div>
										<div className="relative grid">
											<textarea
												id={ids.body}
												rows={9}
												value={fieldsBusy ? '' : body}
												readOnly={fieldsBusy}
												aria-busy={fieldsBusy}
												aria-invalid={!!errors.body || undefined}
												aria-describedby={
													[errors.body && `${ids.body}-error`, hasFallbacks && ids.fallbacks].filter(Boolean).join(' ') || undefined
												}
												onChange={event => editBody(event.target.value)}
												className={field({ invalid: !!errors.body, className: 'resize-y py-2.5 leading-relaxed' })}
											/>
											{fieldsBusy && <FieldScan label={busyLabel} className="absolute inset-0 rounded-sm" />}
										</div>
										{errors.body && <FieldError id={`${ids.body}-error`}>{errors.body}</FieldError>}
										{fallbackNote}
									</div>
								</>
							) : (
								<>
									{/* O botão de copiar fica preso no fim da linha do assunto: nunca cai sozinho na linha de baixo */}
									<p className="m-0 flex items-baseline gap-2 text-sm leading-relaxed">
										<span className={cx(LABEL, 'shrink-0')}>assunto</span>
										<span className="min-w-0 font-semibold wrap-break-word">{subject}</span>
										<CopyButton
											icon
											text={subject}
											what="Assunto"
											label="copiar assunto"
											className="shrink-0 self-center text-muted hover:text-ink"
										/>
									</p>
									{/* A mensagem se copia pelo botão do rodapé, a ação principal sem a conta de e-mail */}
									<span className={LABEL}>mensagem</span>
									{/* Texto corrido, para revisar: sem a fonte mono e com a linha numa largura confortável de ler */}
									{fieldsBusy ? (
										<FieldScan label={busyLabel} className="min-h-40 rounded-sm bg-surface" />
									) : (
										<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{body}</p>
									)}
									{fallbackNote}
								</>
							)}
						</div>

						{/* A IA só entra a pedido: reescreve o texto atual no estilo escolhido (recolhido, para não pesar na tela) */}
						<div className="flex flex-col gap-2 border-t border-line-strong pt-3">
							<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
								<div className="flex flex-wrap items-center gap-2 text-muted text-xs">
									<Button
										variant="ghost"
										size="sm"
										disabled={rewriting || bodyLoading || unresolved.length > 0}
										onClick={improveMessage}
									>
										<Icon name={rewriting ? 'spinner' : 'refresh'} size={13} />
										melhorar com a IA
									</Button>
									{/* Some quando a pessoa edita o corpo: voltar ao de antes perderia a edição */}
									{beforeImprove !== null && (
										<>
											{' · '}
											<TextLink
												className="text-xs"
												disabled={rewriting}
												onClick={() => {
													setBody(beforeImprove)
													setBeforeImprove(null)
												}}
											>
												desfazer
											</TextLink>
										</>
									)}
								</div>
								<span role="status" className="text-muted text-xs">
									{rewriting
										? 'a IA está reescrevendo…'
										: unresolved.length > 0
											? 'complete o que faltou antes de pedir à IA'
											: ''}
								</span>
							</div>
							<Disclosure
								summary={`estilo: ${MESSAGE_TONE_LABELS[tone]}, ${MESSAGE_LENGTH_LABELS[length]}`}
								className="text-xs"
							>
								<div className="flex flex-col gap-2.5 pt-1">
									{/* Tom e tamanho lado a lado; sem espaço, o tamanho desce para a linha de baixo */}
									<div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
									<div className={MESSAGE_OPTION}>
										<span id={ids.tone} className={LABEL}>
											tom
										</span>
										<PillGroup role="group" aria-labelledby={ids.tone}>
											{MESSAGE_TONES.map(option => (
												<Pill key={option} pressed={option === tone} disabled={rewriting} onClick={() => setTone(option)}>
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
												<Pill key={option} pressed={option === length} disabled={rewriting} onClick={() => setLength(option)}>
													{MESSAGE_LENGTH_LABELS[option]}
												</Pill>
											))}
										</PillGroup>
									</div>
									</div>
									<p className="m-0">A IA reescreve o texto atual nesse estilo, sem inventar fatos.</p>
								</div>
							</Disclosure>
						</div>
					</section>

					{/* O currículo é escolha de quem abriu: ele vai anexado ao e-mail */}
					<section aria-label="Currículo" className="flex flex-col gap-2.5 rounded-sm border border-line p-2.5">
						{readyCv ? (
							<div className="flex items-center gap-3">
								<PdfIcon>PDF</PdfIcon>
								<div className="min-w-0 grow">
									<div className="text-sm font-semibold">{canSend ? 'anexo' : 'currículo'}</div>
									<div className="block truncate font-mono text-xs text-muted">{readyCv.fileName}</div>
								</div>
								<div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
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
										? 'Gerando o currículo ajustado para a vaga.'
										: canSend
											? 'Gere o currículo ajustado para a vaga: ele vai anexado ao e-mail.'
											: 'Gere o currículo ajustado para a vaga: o PDF fica para você anexar.'}
									{cv?.status === 'failed' && <span className="block text-danger">O último falhou: {cv.error}</span>}
								</FieldHelp>
								<CvButton job={job} className="shrink-0" />
							</div>
						)}
					</section>
				</div>

				{/* À esquerda, por que o "enviar" está desligado; sem a conta de e-mail, copiar a mensagem é a ação principal */}
				<div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
					<p id={ids.blocker} className="m-0 min-w-0 text-xs text-muted">
						{sendBlocker}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button variant="ghost" type="button" disabled={busy} onClick={() => ref.current?.close()}>
							{editable ? 'cancelar' : 'fechar'}
						</Button>
						{editable ? (
							<Button
								variant="lime"
								type="submit"
								aria-describedby={sendBlocker ? ids.blocker : undefined}
								disabled={busy || !readyCv || sending || rewriting || bodyLoading || unresolved.length > 0}
							>
								<Icon name={busy || sending ? 'spinner' : 'mail'} size={14} />
								{sending ? 'enviando…' : lastSent ? 'enviar de novo' : 'enviar candidatura'}
							</Button>
						) : (
							<CopyButton
								variant="lime"
								text={body}
								what="Texto da mensagem"
								label="copiar mensagem"
								toastAction={copyAction}
								disabled={bodyLoading}
							/>
						)}
					</div>
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
