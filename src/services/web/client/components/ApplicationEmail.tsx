import type { ReactNode } from 'react'

import { formatApplicationBody, type ApplicationMessageText } from '@shared/templates'

import { cx } from '../lib/cx'
import { useMessageSignature } from '../stores/message-settings'
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
}

/**
 * O e-mail de candidatura para copiar. O assunto e o corpo (com a assinatura) têm cada um o seu botão, para colar
 * cada um no seu campo do e-mail sem ter de recortar a linha do assunto.
 */
export function ApplicationEmail({ label, message, busy = false, children, ...props }: ApplicationEmailProps) {
	const body = formatApplicationBody(message, useMessageSignature())

	return (
		<section {...props} className="flex flex-col gap-3 rounded-sm bg-surface-2 p-3.5">
			<div className="flex items-center justify-between gap-3">
				<span className={LABEL}>{label}</span>
				<CopyButton text={body} what="Texto da mensagem" label="copiar mensagem" size="xs" />
			</div>
			<div className={cx('flex flex-col gap-3', busy && 'animate-pulse opacity-55 motion-reduce:animate-none')} aria-busy={busy}>
				<p className="m-0 text-sm leading-relaxed wrap-break-word">
					<span className={cx(LABEL, 'mr-2')}>assunto</span>
					<span className="font-semibold">{message.subject}</span>
					{/* Só o ícone, colado no fim do assunto: fica claro o que ele copia, sem competir com o "copiar mensagem" */}
					<CopyButton
						icon
						text={message.subject}
						what="Assunto"
						label="copiar assunto"
						className="ml-1 align-middle text-muted hover:text-ink"
					/>
				</p>
				{/* Texto corrido, para revisar: sem a fonte mono e com a linha numa largura confortável de ler */}
				<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{body}</p>
			</div>
			{children}
		</section>
	)
}
