import { useId, type HTMLAttributes, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { card } from './Card'
import { FieldHelp } from './Field'
import { SECTION_TITLE } from './text'

type SectionCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
	title: ReactNode
	/** Complemento do título, em mono e apagado (ex.: "coleta `scraper`"). */
	tag?: ReactNode
	/** Explicação da seção, abaixo do título. */
	description?: ReactNode
	/** À direita do título (botões, um contador); desce para baixo dele quando não cabe. */
	aside?: ReactNode
}

/**
 * Seção das telas com formulário (configurações, currículo base): a caixa `card({ size: 'lg' })` com o título (`h2`),
 * que nomeia a seção pelo `aria-labelledby`. O `id` (âncora do `SectionNav`) e as outras props vão para a `<section>`.
 */
export function SectionCard({ title, tag, description, aside, className, children, ...props }: SectionCardProps) {
	const titleId = useId()

	let header = (
		<h2 id={titleId} className={SECTION_TITLE}>
			{title}
			{tag && (
				<>
					{' '}
					<span className="font-mono text-xs font-normal text-muted">{tag}</span>
				</>
			)}
		</h2>
	)
	if (aside) {
		header = (
			<div className="flex flex-wrap items-center justify-between gap-3">
				{header}
				{aside}
			</div>
		)
	}
	if (description) {
		header = (
			<div className="flex flex-col gap-1.5">
				{header}
				<FieldHelp>{description}</FieldHelp>
			</div>
		)
	}

	return (
		<section
			{...props}
			className={card({ size: 'lg', className: cx('flex flex-col gap-6.5', className) })}
			aria-labelledby={titleId}
		>
			{header}
			{children}
		</section>
	)
}
