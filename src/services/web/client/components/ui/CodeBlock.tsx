import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { LABEL } from './text'

type CodeBlockProps = {
	/** O que é o texto, no topo do bloco (ex.: "documento no mongodb"). */
	label: string
	children: string
	/** A ação no topo, ao lado do rótulo (ex.: um `CopyButton`). */
	action?: ReactNode
	/** Limita a altura e rola dentro do bloco, para textos longos como um JSON. */
	scroll?: boolean
	className?: string
}

/** Texto técnico para ler e copiar (o JSON da vaga, o erro de uma busca), em fonte mono e com as quebras de linha. */
export function CodeBlock({ label, children, action, scroll, className }: CodeBlockProps) {
	return (
		// Os tokens da superfície invertida (texto claro), sobre o fundo próprio de código
		<div className={cx('inverted flex flex-col gap-2.5 rounded-sm bg-code-bg p-3.5', className)}>
			<div className="flex items-center justify-between gap-3">
				<span className={LABEL}>{label}</span>
				{action}
			</div>
			<pre
				className={cx(
					'm-0 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-break-word',
					scroll && 'max-h-90 overflow-auto',
				)}
			>
				{children}
			</pre>
		</div>
	)
}
