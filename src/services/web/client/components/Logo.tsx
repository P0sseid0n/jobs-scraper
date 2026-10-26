import type { VariantProps } from 'tailwind-variants'

import { tv } from '../lib/cx'
import { ProjectIcon } from './ProjectIcon'

const logo = tv({
	base: 'inline-flex items-center font-mono font-medium whitespace-nowrap',
	variants: {
		/** `sm`: o cabeçalho do site. `md`: o topo do onboarding no celular. `lg`: o topo do onboarding. */
		size: { sm: 'gap-2 text-sm', md: 'gap-2 text-base', lg: 'gap-2.5 text-lg' },
	},
	defaultVariants: { size: 'sm' },
})

/** O tamanho do ícone em cada tamanho do logo, proporcional ao texto. */
const ICON_SIZES = { sm: 22, md: 25, lg: 28 } as const

type LogoSize = NonNullable<VariantProps<typeof logo>['size']>

/** O logo do projeto: o ícone e "jobs/scraper". Dentro de um link, vira o link para o início. */
export function Logo({ size = 'sm', className }: { size?: LogoSize; className?: string }) {
	return (
		<span className={logo({ size, className })}>
			<ProjectIcon size={ICON_SIZES[size]} />
			<span>jobs/scraper</span>
		</span>
	)
}
