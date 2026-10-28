import type { ReactNode } from 'react'

import { formatApplicationBody, type ApplicationMessageText } from '@shared/templates'

import { cx } from '../lib/cx'
import { useMessageSignature } from '../stores/message-settings'
import { copyText } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { LABEL } from './ui/text'

/** Na tela de toque, os botões pequenos chegam aos 44px de altura. */
export const TOUCH_BUTTON = 'pointer-coarse:min-h-11'

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
				<Button variant="ghost" size="xs" className={TOUCH_BUTTON} onClick={() => copyText(body, 'Texto da mensagem')}>
					<Icon name="copy" size={13} />
					copiar mensagem
				</Button>
			</div>
			<div className={cx('flex flex-col gap-3', busy && 'animate-pulse opacity-55 motion-reduce:animate-none')} aria-busy={busy}>
				{/* No celular, o botão vai para baixo do assunto, que fica com a linha toda */}
				<div className="flex items-start justify-between gap-3 max-sm:flex-col max-sm:gap-2">
					<p className="m-0 text-sm leading-relaxed wrap-break-word">
						<span className={cx(LABEL, 'mr-2')}>assunto</span>
						<span className="font-semibold">{message.subject}</span>
					</p>
					<Button variant="ghost" size="xs" className={TOUCH_BUTTON} onClick={() => copyText(message.subject, 'Assunto')}>
						<Icon name="copy" size={13} />
						copiar assunto
					</Button>
				</div>
				{/* Texto corrido, para revisar: sem a fonte mono e com a linha numa largura confortável de ler */}
				<p className="m-0 max-w-prose text-sm leading-relaxed whitespace-pre-wrap wrap-break-word">{body}</p>
			</div>
			{children}
		</section>
	)
}
