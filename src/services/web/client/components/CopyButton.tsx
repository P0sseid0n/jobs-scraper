import { useEffect, useRef, useState } from 'react'

import { copyText } from '../stores/toast'
import { Icon } from './Icon'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'

/** Quanto tempo o ✓ fica no lugar do ícone de copiar. */
const COPIED_MS = 1500

type CopyButtonProps = {
	text: string
	/** O que é copiado, para o aviso ("E-mail" → "E-mail copiado"). */
	what: string
	className?: string
} & (
	| {
			/** Só o ícone, colado no que ele copia: `label` vira o nome no leitor de tela e a dica do mouse. */
			icon: true
			label: string
	  }
	| {
			icon?: false
			/** O texto do botão (padrão: "copiar"). */
			label?: string
			size?: 'xs' | 'md'
	  }
)

/**
 * Copia o texto avisando no toast e, por um instante, troca o ícone por um ✓ ali mesmo (no botão com texto, o texto vira
 * "copiado"). Se a cópia falhar, só o aviso de erro aparece.
 */
export function CopyButton({ text, what, className, ...props }: CopyButtonProps) {
	const [copied, setCopied] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
	useEffect(() => () => clearTimeout(timer.current), [])

	async function copy() {
		if (!(await copyText(text, what))) return
		setCopied(true)
		clearTimeout(timer.current)
		timer.current = setTimeout(() => setCopied(false), COPIED_MS)
	}

	if (props.icon) {
		return (
			<IconButton label={props.label} size="xs" className={className} onClick={copy}>
				<Icon name={copied ? 'check' : 'copy'} size={14} />
			</IconButton>
		)
	}

	const size = props.size ?? 'md'
	return (
		<Button variant="ghost" size={size} className={className} onClick={copy}>
			<Icon name={copied ? 'check' : 'copy'} size={size === 'xs' ? 13 : 14} />
			{copied ? 'copiado' : (props.label ?? 'copiar')}
		</Button>
	)
}
