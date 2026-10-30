import type { HTMLAttributes } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { Icon, type IconName } from '../Icon'

const statusLine = tv({
	base: 'flex items-center gap-2 text-sm',
	variants: {
		/** Sem `tone`, na cor do texto. `ok`: deu certo ("Compilou sem erros"); `muted`: esperando algo de fundo. */
		tone: { ok: 'text-ok', muted: 'text-muted' },
	},
})

type StatusLineProps = HTMLAttributes<HTMLParagraphElement> &
	VariantProps<typeof statusLine> & {
		/** Normalmente `check` (pronto) ou `spinner` (em andamento). */
		icon: IconName
		/** `false` dentro de outro `role="status"` (ex.: com uma mensagem embaixo), para não ser anunciada duas vezes. */
		live?: boolean
	}

/**
 * Uma linha com o andamento ou o resultado de algo ("Validando no cv-updater…", "Esta versão é o currículo base"),
 * anunciada ao leitor de tela (`role="status"`).
 */
export function StatusLine({ tone, icon, live = true, className, children, ...props }: StatusLineProps) {
	return (
		<p role={live ? 'status' : undefined} {...props} className={statusLine({ tone, className })}>
			<Icon name={icon} />
			{children}
		</p>
	)
}
