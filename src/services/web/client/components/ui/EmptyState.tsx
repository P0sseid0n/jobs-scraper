import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { card } from './Card'

type EmptyStateProps = {
	title: ReactNode
	description?: ReactNode
	/** Botão que resolve (ex.: "limpar filtros", "tentar de novo"). */
	action?: ReactNode
	/** `error`: não deu para carregar; mostra o ícone de alerta e avisa o leitor de tela. */
	tone?: 'neutral' | 'error'
	/** Sem o card em volta, para quando já está dentro de um (ex.: o painel da vaga). */
	bare?: boolean
	className?: string
}

/** Tela ou bloco sem conteúdo: nada encontrado, nada ainda ou falha ao carregar. */
export function EmptyState({ title, description, action, tone = 'neutral', bare = false, className }: EmptyStateProps) {
	return (
		<div
			role={tone === 'error' ? 'alert' : undefined}
			className={cx('flex flex-col items-center gap-2.5 px-6 py-12 text-center', !bare && card(), className)}
		>
			{tone === 'error' && <Icon name="alert" size={22} />}
			<p className="font-semibold">{title}</p>
			{description && <p className="text-sm text-muted">{description}</p>}
			{action && <div className="mt-1.5">{action}</div>}
		</div>
	)
}
