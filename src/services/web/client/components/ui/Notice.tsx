import type { ReactNode } from 'react'
import type { VariantProps } from 'tailwind-variants'

import { tv } from '../../lib/cx'
import { Icon, type IconName } from '../Icon'

const notice = tv({
	base: 'flex items-start rounded-sm',
	variants: {
		tone: { warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger' },
		/** `lg`: aviso de destaque da tela, com ícone maior (ex.: a última coleta falhou). */
		size: { md: 'gap-2.5 px-3 py-2.5', lg: 'gap-3.5 rounded-lg px-[18px] py-4' },
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
			{icon && <Icon name={icon} size={size === 'lg' ? 20 : 16} />}
			<div className="min-w-0 grow">{children}</div>
		</div>
	)
}
