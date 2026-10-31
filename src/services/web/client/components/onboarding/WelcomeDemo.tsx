import { Fragment, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { useT } from '../../stores/locale'
import { Cursor, Swap, useDemoRound } from '../demo-parts'
import { Icon } from '../Icon'
import { badge, BadgeList } from '../ui/Badge'
import { card } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'
import { META } from '../ui/text'

const RISE = 'animate-rise-in motion-reduce:animate-none'

/** Quando o marca-texto acende cada trecho do post, um depois do outro. */
const MARK_DELAYS = ['stagger-13', 'stagger-15', 'stagger-17', 'stagger-18', 'stagger-20']

/** Uma volta até começar a sumir: uns 8 s montando e uns 12 s parada no fim, com o e-mail enviado. */
const ROUND_MS = 20000

/** Um trecho do post que a IA lê: o marca-texto passa por cima, um trecho depois do outro. */
function Mark({ delay, children }: { delay: string; children: ReactNode }) {
	return (
		<mark
			className={cx(
				'rounded-xs bg-linear-to-r from-lime-soft to-lime-soft bg-no-repeat text-lime-text animate-mark-in motion-reduce:animate-none',
				delay,
			)}
		>
			{children}
		</mark>
	)
}

/**
 * A demonstração da abertura, ao lado dos passos: um post do LinkedIn, a IA lendo e marcando os trechos que importam,
 * a vaga que sai dele, o currículo sendo ajustado e o clique em "enviar candidatura", com o e-mail saindo. Toca em
 * loop: parada no fim, com tudo na tela, ficaria texto demais ao lado dos passos. A cada volta some devagar e monta de novo (a `key` nova reinicia as animações); com movimento reduzido, fica pronta.
 */
export function WelcomeDemo() {
	const { round, leaving } = useDemoRound(ROUND_MS)
	const demo = useT().welcomeDemo

	return (
		<figure
			key={round}
			aria-label={demo.label}
			className={cx('m-0 flex flex-col gap-3 transition-opacity duration-500', leaving && 'opacity-0')}
		>
			<div className={cx(card({ size: 'sm' }), 'flex flex-col gap-3', RISE, 'stagger-4')}>
				<div className="flex items-center gap-2.5">
					<span
						aria-hidden="true"
						className="grid size-8 place-items-center rounded-full bg-surface-2 font-mono text-xs font-semibold"
					>
						AS
					</span>
					<span className="text-sm leading-tight">
						<span className="block font-semibold">Ana Souza</span>
						<span className="block text-xs text-muted">{demo.recruiter}</span>
					</span>
				</div>
				{/* A faixa de leitura desce pelo texto, e o marca-texto acende cada trecho logo depois que ela passa */}
				<div className="relative overflow-hidden">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 h-6 bg-linear-to-b from-transparent via-lime/30 to-transparent animate-scan motion-reduce:hidden stagger-11"
					/>
					<p className="text-sm leading-relaxed">
						{demo.post.parts.map((part, index) => (
							<Fragment key={index}>
								{part}
								{demo.post.marks[index] && <Mark delay={MARK_DELAYS[index]!}>{demo.post.marks[index]}</Mark>}
							</Fragment>
						))}
					</p>
				</div>
				<span className={cx(META, 'border-t border-line pt-2.5', RISE, 'stagger-8')}>
					<Swap
						outDelay="stagger-27"
						inDelay="stagger-28"
						working={
							<>
								<StatusDot tone="lime" pulse />
								{demo.reading}
							</>
						}
						done={
							<>
								<Icon name="check" size={14} className="text-lime-text" />
								{demo.found}
							</>
						}
					/>
				</span>
			</div>

			<p aria-hidden="true" className={cx(META, 'flex items-center gap-1.5 self-center', RISE, 'stagger-31')}>
				<Icon name="chevron" size={14} />
				{demo.becomesJob}
			</p>

			<div className={cx(card({ size: 'sm' }), 'flex flex-col gap-3', RISE, 'stagger-33')}>
				<div className="flex items-start justify-between gap-3">
					<span className="leading-tight">
						<span className="block font-semibold">{demo.jobTitle}</span>
						<span className="block text-sm text-muted">{demo.seenIn}</span>
					</span>
					<span className="flex shrink-0 gap-1.5">
						{demo.badges.map(label => (
							<span key={label} className={badge({ size: 'sm' })}>
								{label}
							</span>
						))}
					</span>
				</div>
				<BadgeList aria-label={demo.technologies}>
					<li className={badge({ size: 'sm', tone: 'plain', bordered: true })}>React</li>
					<li className={badge({ size: 'sm', tone: 'plain', bordered: true })}>TypeScript</li>
				</BadgeList>
				<span
					className={cx(
						badge({ tone: 'running', size: 'sm' }),
						'self-start animate-pop-in motion-reduce:animate-none stagger-39',
					)}
				>
					<Swap
						outDelay="stagger-49"
						inDelay="stagger-50"
						working={
							<>
								<Icon name="spinner" size={14} />
								{demo.tailoring}
							</>
						}
						done={
							<>
								<Icon name="check" size={14} />
								{demo.tailored}
							</>
						}
					/>
				</span>
				{/* O cursor chega, clica em "enviar candidatura" e o e-mail sai */}
				<span className={cx('relative self-start', RISE, 'stagger-56')}>
					<span className="inline-flex min-h-8 items-center rounded-pill bg-lime px-3 py-1.5 text-xs font-semibold text-lime-ink animate-press-once motion-reduce:animate-none stagger-68">
						<Swap
							outDelay="stagger-69"
							inDelay="stagger-70"
							working={
								<>
									<Icon name="mail" size={14} />
									{demo.send}
								</>
							}
							done={
								<Swap
									outDelay="stagger-82"
									inDelay="stagger-83"
									working={
										<>
											<Icon name="spinner" size={14} />
											{demo.sending}
										</>
									}
									done={
										<>
											<Icon name="check" size={14} />
											{demo.sent}
										</>
									}
								/>
							}
						/>
					</span>
					<Cursor className="top-1/2 left-3/4 stagger-60" />
				</span>
			</div>
		</figure>
	)
}
