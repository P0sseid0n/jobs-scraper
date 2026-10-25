import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

import type { CvChanges } from '@shared/contracts'

import type { WebCvRequest } from '../../api-types'
import { cvPdfUrl } from '../api'
import { cx } from '../lib/cx'
import { reducedMotion } from '../lib/motion'
import { isJustReady, markShown } from '../stores/cv'
import { badge, BadgeList } from './ui/Badge'
import { PdfIcon } from './ui/PdfIcon'
import { LABEL } from './ui/text'
import { TextLink } from './ui/TextLink'

/**
 * Quando cada parte do ajuste aparece (ms), no currículo que acabou de ficar pronto: a faixa de leitura passa pela
 * caixa, o selo acende, as habilidades que saíram são riscadas e as novas entram, os projetos sobem e a apresentação
 * antiga é riscada antes de a nova ser escrita no lugar.
 */
const AT = { mark: 300, removed: 600, added: 900, projects: 1300, strikeSummary: 1200, typeSummary: 2000 }
/** Entre um item e o seguinte da mesma linha. */
const STEP_MS = 90
/** A apresentação nova leva isso para ser escrita, qualquer que seja o tamanho. */
const TYPING_MS = 1800
const TYPING_TICK_MS = 30

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

/**
 * O currículo pronto da vaga, com o que mudou em relação ao currículo base (tecnologias que entraram e saíram, a
 * apresentação reescrita e os projetos escolhidos). Na primeira vez que aparece depois de ficar pronto com o site aberto,
 * o ajuste é mostrado sendo feito; depois, já vem pronto.
 */
export function CvReady({ cv }: { cv: WebCvRequest }) {
	const [fresh] = useState(() => isJustReady(cv.requestId) && !reducedMotion())
	useEffect(() => markShown(cv.requestId), [cv.requestId])

	const { changes } = cv
	const changed =
		!!changes &&
		(changes.addedSkills.length > 0 || changes.removedSkills.length > 0 || !!changes.summary || changes.projects.length > 0)

	return (
		<div className="relative flex flex-col gap-3.5 overflow-hidden rounded-md bg-lime-soft p-3">
			{fresh && (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 h-6 bg-linear-to-b from-transparent via-lime/40 to-transparent animate-scan"
				/>
			)}
			<div className="flex items-center gap-3">
				<span className={cx(fresh && 'animate-pop')}>
					<PdfIcon>PDF</PdfIcon>
				</span>
				<div className="grow min-w-0">
					<div className="font-semibold text-sm">currículo pronto</div>
					<div className="font-mono text-muted text-xs block truncate">{cv.fileName}</div>
				</div>
				<TextLink className="text-sm" href={cvPdfUrl(cv.requestId)} external>
					pré-visualizar
				</TextLink>
			</div>
			{changes && changed && <Changes changes={changes} fresh={fresh} />}
		</div>
	)
}

function Changes({ changes, fresh }: { changes: CvChanges; fresh: boolean }) {
	const { addedSkills, removedSkills, summary, projects } = changes

	return (
		<section className="flex flex-col gap-3 border-t border-line pt-3" aria-label="O que mudou no currículo">
			<span
				className={cx(
					LABEL,
					'self-start rounded-xs bg-linear-to-r from-lime to-lime bg-no-repeat px-1 text-lime-ink',
					fresh && 'animate-mark-in',
				)}
				style={fresh ? delay(AT.mark) : undefined}
			>
				ajustado para esta vaga_
			</span>

			{(addedSkills.length > 0 || removedSkills.length > 0) && (
				<Row label="tecnologias">
					<BadgeList aria-label="Tecnologias que entraram e saíram">
						{addedSkills.map((skill, index) => (
							<li
								key={`+${skill}`}
								className={badge({ tone: 'lime', className: cx(fresh && 'animate-pop-in') })}
								style={fresh ? delay(AT.added + index * STEP_MS) : undefined}
							>
								<span className="sr-only">entrou:</span>
								<span aria-hidden="true">+</span>
								{skill}
							</li>
						))}
						{removedSkills.map((skill, index) => (
							<li key={`-${skill}`} className={badge({ tone: 'plain', bordered: true, className: 'text-muted' })}>
								<span className="sr-only">saiu:</span>
								<span
									className={cx('strike-through', fresh && 'animate-strike-in')}
									style={fresh ? delay(AT.removed + index * STEP_MS) : undefined}
								>
									{skill}
								</span>
							</li>
						))}
					</BadgeList>
				</Row>
			)}

			{summary && (
				<Row label="apresentação">
					<Summary summary={summary} fresh={fresh} />
				</Row>
			)}

			{projects.length > 0 && (
				<Row label="projetos">
					<ol className="m-0 flex list-none flex-wrap gap-x-1.5 gap-y-1 p-0 text-sm" aria-label="Projetos no currículo, na ordem">
						{projects.map((name, index) => (
							<li
								key={name}
								className={cx(fresh && 'animate-rise-in')}
								style={fresh ? delay(AT.projects + index * STEP_MS) : undefined}
							>
								{name}
								{index < projects.length - 1 && <span className="text-muted"> ·</span>}
							</li>
						))}
					</ol>
				</Row>
			)}
		</section>
	)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-baseline gap-3 max-md:flex-col max-md:gap-1.5">
			<span className={cx(LABEL, 'w-24 shrink-0')}>{label}</span>
			<div className="min-w-0 grow">{children}</div>
		</div>
	)
}

/**
 * A apresentação reescrita para a vaga. Acabando de ficar pronta, a antiga aparece e é riscada, e a nova é escrita no
 * lugar dela, com o cursor piscando; depois, a antiga fica a um clique.
 */
function Summary({ summary, fresh }: { summary: NonNullable<CvChanges['summary']>; fresh: boolean }) {
	const [phase, setPhase] = useState<'before' | 'typing' | 'done'>(fresh ? 'before' : 'done')
	const [typed, setTyped] = useState(0)
	const [showOriginal, setShowOriginal] = useState(false)
	const text = summary.after

	useEffect(() => {
		if (phase === 'before') {
			const timer = setTimeout(() => setPhase('typing'), AT.typeSummary)
			return () => clearTimeout(timer)
		}
		if (phase !== 'typing') return

		const step = Math.max(1, Math.ceil(text.length / (TYPING_MS / TYPING_TICK_MS)))
		const timer = setInterval(() => setTyped(count => Math.min(text.length, count + step)), TYPING_TICK_MS)
		return () => clearInterval(timer)
	}, [phase, text])

	useEffect(() => {
		if (phase === 'typing' && typed >= text.length) setPhase('done')
	}, [phase, typed, text])

	return (
		<div className="flex flex-col gap-1.5 text-sm leading-relaxed">
			{phase !== 'done' && <p className="sr-only">{text}</p>}
			{phase === 'before' && (
				<p aria-hidden="true" className="text-muted">
					<span className="strike-through animate-strike-in" style={delay(AT.strikeSummary)}>
						{summary.before}
					</span>
				</p>
			)}
			{phase === 'typing' && (
				<p aria-hidden="true">
					{text.slice(0, typed)}
					<span className="ml-px inline-block h-4 w-0.5 translate-y-0.5 bg-ink animate-caret" />
				</p>
			)}
			{phase === 'done' && (
				<>
					<p>{text}</p>
					<TextLink className="self-start text-xs" aria-expanded={showOriginal} onClick={() => setShowOriginal(!showOriginal)}>
						{showOriginal ? 'esconder a apresentação original' : 'ver a apresentação original'}
					</TextLink>
					{showOriginal && (
						<p className="text-muted animate-panel-in motion-reduce:animate-none">
							<span className="sr-only">original, trocada pela de cima:</span>
							<span className="strike-through">{summary.before}</span>
						</p>
					)}
				</>
			)}
		</div>
	)
}
