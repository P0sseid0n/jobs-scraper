import type { ReactNode } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { Icon, type IconName } from '../Icon'

const notice = tv({
	base: 'flex items-start rounded-sm',
	variants: {
		/** `info`: uma explicação a mais, sem nada errado (o ícone fica apagado e o texto na cor normal). */
		tone: { info: 'bg-surface-2 text-ink', warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger' },
		/** `md`: o texto em `text-sm`, como no resto da tela; `lg`: aviso de destaque da tela, com ícone maior (ex.: a última coleta falhou). */
		size: { md: 'gap-2.5 px-3 py-2.5 text-sm', lg: 'gap-3.5 rounded-lg px-4.5 py-4' },
	},
	defaultVariants: { size: 'md' },
})

type NoticeProps = Required<Pick<VariantProps<typeof notice>, 'tone'>> &
	Pick<VariantProps<typeof notice>, 'size'> & {
		icon?: IconName
		className?: string
		children: ReactNode
	}

/** Aviso dentro da tela (dados duvidosos, falha de uma parte); erros que pedem ação usam `role="alert"`. */
export function Notice({ tone, size, icon, className, children }: NoticeProps) {
	return (
		<div role={tone === 'danger' ? 'alert' : undefined} className={notice({ tone, size, className })}>
			{icon && <Icon name={icon} size={size === 'lg' ? 20 : 16} className={tone === 'info' ? 'text-muted' : undefined} />}
			<div className="min-w-0 grow">{children}</div>
		</div>
	)
}
