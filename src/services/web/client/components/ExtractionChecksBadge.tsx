import { EXTRACTION_CHECKS, type ExtractionCheck } from '@shared/contracts'

import type { WebJob } from '../../api-types'
import { cx } from '../lib/cx'
import { useLocale, useT } from '../stores/locale'
import { Icon } from './Icon'
import { Badge } from './ui/Badge'
import { LIST, META } from './ui/text'

/**
 * Cor do selo por quantidade de checks (1 a 6), do amarelo ao vermelho forte. As classes ficam escritas por inteiro
 * para o Tailwind encontrá-las; na superfície escura (card selecionado), os tokens já trocam para a versão clara.
 */
const LEVEL_COLORS = ['text-check-1', 'text-check-2', 'text-check-3', 'text-check-4', 'text-check-5', 'text-check-6']

/** "o **cargo** e as **tecnologias**": os checks que falharam, com artigo e o nome em negrito, para o meio de uma frase. */
export function MissedChecks({ job }: { job: Pick<WebJob, 'extractionChecks'> }) {
	const { checks } = useT()
	const locale = useLocale()
	// O Intl junta com vírgulas e "e"; os índices marcam onde entra cada check
	const parts = new Intl.ListFormat(locale).formatToParts(job.extractionChecks.map((_, index) => String(index)))
	return (
		<>
			{parts.map(part => {
				if (part.type === 'literal') return part.value
				const check = job.extractionChecks[Number(part.value)] as ExtractionCheck
				return (
					<span key={check}>
						{checks.articles[check]} <strong className="font-semibold">{checks.labels[check]}</strong>
					</span>
				)
			})}
		</>
	)
}

/**
 * Selo "⚠ 2/6" dos checks da extração. Sem checks, não aparece; o hover ou o foco abre a lista dos checks que falharam.
 * `iconOnly` (a lista): só o ícone na cor do nível, para não poluir o card.
 */
export function ExtractionChecksBadge({
	job,
	iconOnly = false,
	className,
}: {
	job: Pick<WebJob, 'extractionChecks' | 'needsReview'>
	iconOnly?: boolean
	className?: string
}) {
	const { checks } = useT()
	const count = job.extractionChecks.length
	if (count === 0) return null

	const total = EXTRACTION_CHECKS.length
	const review = job.needsReview
	const color = LEVEL_COLORS[count - 1]
	const description = checks.description(count, total, job.extractionChecks.map(check => checks.labels[check]).join(', '))

	return (
		// Por cima do link que cobre o card (`z-10`), para o hover chegar ao selo; aberto, sobe acima dos cards de baixo.
		// Focável: pelo teclado (ou um toque), a lista abre como no hover
		<span
			// biome-ignore lint/a11y/noNoninteractiveTabindex: o foco é o que abre a lista dos checks pelo teclado ou toque
			tabIndex={0}
			className={cx('group/checks relative z-10 inline-flex rounded-pill hover:z-30 focus-visible:z-30', className)}
		>
			{iconOnly ? (
				<span className={cx('inline-flex', color)}>
					<Icon name="alert" size={16} />
				</span>
			) : (
				<Badge tone={review ? 'danger' : 'plain'} bordered={!review} className={cx('border-current', color)}>
					<Icon name="alert" size={13} />
					<span aria-hidden="true">
						{count}/{total}
					</span>
				</Badge>
			)}
			<span className="sr-only">{description}</span>
			<ChecksList job={job} alignRight={iconOnly} />
		</span>
	)
}

/** A lista do hover: só os checks que falharam. Só visual: o `sr-only` do selo já diz o mesmo. */
function ChecksList({ job, alignRight }: { job: Pick<WebJob, 'extractionChecks' | 'needsReview'>; alignRight: boolean }) {
	const { checks } = useT()
	return (
		<span
			aria-hidden="true"
			className={cx(
				'absolute top-full z-20 hidden w-max flex-col gap-1 rounded-md border border-line bg-surface p-3 text-ink shadow-float group-hover/checks:flex group-focus/checks:flex',
				// No card, o selo fica na borda direita; no celular, desce para a esquerda
				alignRight ? 'right-0 max-md:right-auto max-md:left-0' : 'left-0',
			)}
		>
			<span className={META}>{checks.failed}</span>
			<ul className={cx(LIST, 'flex flex-col gap-1 text-sm')}>
				{job.extractionChecks.map(check => (
					<li key={check} className="flex items-center gap-2">
						<Icon name="close" size={14} className="text-danger" />
						<span className="font-medium">{checks.labels[check]}</span>
					</li>
				))}
			</ul>
			{job.needsReview && <span className="max-w-56 text-muted text-xs">{checks.review}</span>}
		</span>
	)
}
