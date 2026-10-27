import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { card } from './Card'
import { EmptyIllustration, type EmptyIllustrationName } from './EmptyIllustration'

type EmptyStateProps = {
	title: ReactNode
	description?: ReactNode
	/** Botão que resolve (ex.: "limpar filtros", "tentar de novo"). */
	action?: ReactNode
	/** `error`: não deu para carregar; mostra a folha rasgada (sem outro desenho) e avisa o leitor de tela. */
	tone?: 'neutral' | 'error'
	/** O desenho em cima do título; sem ele (e sem erro), só o texto. */
	illustration?: EmptyIllustrationName
	/** Sem o card em volta, para quando já está dentro de um (ex.: o painel da vaga). */
	bare?: boolean
	className?: string
}

/** Tela ou bloco sem conteúdo: nada encontrado, nada ainda ou falha ao carregar. */
export function EmptyState({ title, description, action, tone = 'neutral', illustration, bare = false, className }: EmptyStateProps) {
	const drawing = illustration ?? (tone === 'error' ? 'error' : null)

	return (
		<div
			role={tone === 'error' ? 'alert' : undefined}
			className={cx('flex flex-col items-center gap-2.5 px-6 py-12 text-center', !bare && card(), className)}
		>
			{drawing && <EmptyIllustration name={drawing} />}
			<p className="font-semibold text-balance">{title}</p>
			{description && <p className="max-w-130 text-sm text-pretty text-muted">{description}</p>}
			{action && <div className="mt-1.5">{action}</div>}
		</div>
	)
}
