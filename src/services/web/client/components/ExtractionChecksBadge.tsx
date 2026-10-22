import { EXTRACTION_CHECK_LABELS, EXTRACTION_CHECKS, needsReview } from '@shared/contracts'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { Badge } from './ui/Badge'

/**
 * Cor do selo por quantidade de checks (1 a 6): o vermelho fica mais forte a cada um. As classes ficam escritas por
 * inteiro para o Tailwind encontrá-las; na superfície escura (card selecionado), o vermelho claro.
 */
const LEVEL_COLORS = [
	'text-danger/50 in-[.inverted]:text-danger-dot/50',
	'text-danger/60 in-[.inverted]:text-danger-dot/60',
	'text-danger/70 in-[.inverted]:text-danger-dot/70',
	'text-danger/80 in-[.inverted]:text-danger-dot/80',
	'text-danger/90 in-[.inverted]:text-danger-dot/90',
	'text-danger in-[.inverted]:text-danger-dot',
]

/** O que cada check quer dizer, para o hover e o detalhe da vaga. */
export function extractionCheckList(job: Pick<WebJob, 'extractionChecks'>) {
	return job.extractionChecks.map(check => EXTRACTION_CHECK_LABELS[check])
}

/**
 * Selo "⚠ 2/6" dos checks da extração: campos em que a IA citou o que não está escrito no post. Sem checks, não
 * aparece; o hover lista quais dispararam. `iconOnly` (a lista): só o ícone na cor do nível, para não poluir o card.
 */
export function ExtractionChecksBadge({
	job,
	iconOnly = false,
	className,
}: {
	job: Pick<WebJob, 'extractionChecks'>
	iconOnly?: boolean
	className?: string
}) {
	const count = job.extractionChecks.length
	if (count === 0) return null

	const total = EXTRACTION_CHECKS.length
	const description = `A IA citou o que não está escrito no post: ${extractionCheckList(job).join(', ')}`
	const review = needsReview(job.extractionChecks)
	const title = review ? `${description}. Confira o post original e reporte a vaga.` : description

	if (iconOnly) {
		return (
			<span className={cx('inline-flex', LEVEL_COLORS[count - 1], className)} title={`${count}/${total} · ${title}`}>
				<Icon name="alert" size={16} />
				<span className="sr-only">
					{count} de {total} checks da extração. {description}
				</span>
			</span>
		)
	}

	return (
		<Badge
			tone={review ? 'danger' : 'plain'}
			bordered={!review}
			className={cx('border-current', LEVEL_COLORS[count - 1], className)}
			title={title}
		>
			<Icon name="alert" size={13} />
			<span aria-hidden="true">
				{count}/{total}
			</span>
			<span className="sr-only">
				{count} de {total} checks da extração. {description}
			</span>
		</Badge>
	)
}
