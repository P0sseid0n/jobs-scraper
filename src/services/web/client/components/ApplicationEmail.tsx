import type { ReactNode } from 'react'

import { formatApplicationBody, type ApplicationMessageText } from '@shared/templates'

import { cx } from '../lib/cx'
import { useMessageSignature } from '../stores/message-settings'
import type { ToastAction } from '../stores/toast'
import { CopyButton } from './CopyButton'
import { LABEL } from './ui/text'

type ApplicationEmailProps = {
	/** O rótulo no alto da caixa ("mensagem gerada pela IA"). */
	label: string
	message: ApplicationMessageText
	/** A IA está reescrevendo: o texto pulsa, apagado. */
	busy?: boolean
	'aria-label': string
	/** O que vem depois do corpo (as opções de reescrita, o rodapé). */
	children?: ReactNode
	/** Um botão no aviso de que a mensagem foi copiada (no detalhe da vaga, "marcar como enviada"). */
	copyAction?: ToastAction
}

/**
 * O e-mail de candidatura para copiar. O assunto e o corpo (com a assinatura) têm cada um o seu botão, para colar
 * cada um no seu campo do e-mail sem ter de recortar a linha do assunto.
 */
export function ApplicationEmail({ label, message, busy = false, children, copyAction, ...props }: ApplicationEmailProps) {
	const body = formatApplicationBody(message, useMessageSignature())

	return (
		<section {...props} className="flex flex-col gap-3 rounded-sm bg-surface-2 p-3.5">
			<span className={LABEL}>{label}</span>
			<div className={cx('flex flex-col gap-3', busy && 'animate-pulse opacity-55 motion-reduce:animate-none')} aria-busy={busy}>
				{/* Cada parte tem o botão de copiar só com o ícone, junto do rótulo dela (como na modal de contato); o do assunto
				 * fica preso no fim da linha: nunca cai sozinho na linha de baixo */}
				<p className="m-0 flex items-baseline gap-2 text-sm leading-relaxed">
					<span className={cx(LABEL, 'shrink-0')}>assunto</span>
					<span className="min-w-0 font-semibold wrap-break-word">{message.subject}</span>
					<CopyButton
						icon
						text={message.subject}
						what="Assunto"
						label="copiar assunto"
						className="shrink-0 self-center text-muted hover:text-ink"
					/>
				</p>
				<p className="m-0 flex items-center gap-2">
					<span className={LABEL}>mensagem</span>
					<CopyButton
						icon
						text={body}
						what="Texto da mensagem"
						label="copiar mensagem"
						toastAction={copyAction}
						className="text-muted hover:text-ink"
					/>
				</p>
				{/* Texto corrido, para revisar: sem a fonte mono e com a linha numa largura confortável de ler */}
				<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{body}</p>
			</div>
			{children}
		</section>
	)
}
