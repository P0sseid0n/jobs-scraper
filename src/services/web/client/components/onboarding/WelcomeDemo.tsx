import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { badge, BadgeList } from '../ui/Badge'
import { card } from '../ui/Card'

const RISE = 'animate-rise-in motion-reduce:animate-none'

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
 * A demonstração da abertura, ao lado dos passos: um post do LinkedIn, os trechos que a IA lê e a vaga que sai dele,
 * já com o currículo ajustado. Toca uma vez e para no fim; com movimento reduzido, aparece pronta.
 */
export function WelcomeDemo() {
	return (
		<figure aria-label="Exemplo: um post do LinkedIn que vira uma vaga" className="m-0 flex flex-col gap-3">
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
						<span className="block text-xs text-muted">recrutadora · há 2 h</span>
					</span>
				</div>
				<p className="text-sm leading-relaxed">
					Estamos contratando! Vaga para <Mark delay="stagger-12">dev front-end</Mark>,{' '}
					<Mark delay="stagger-14">100% remoto</Mark>, contrato <Mark delay="stagger-16">PJ</Mark>. Stack:{' '}
					<Mark delay="stagger-18">React</Mark> e <Mark delay="stagger-19">TypeScript</Mark>. Chama no direct!
				</p>
			</div>

			<p
				aria-hidden="true"
				className={cx('flex items-center gap-1.5 self-center font-mono text-xs text-muted', RISE, 'stagger-22')}
			>
				<Icon name="chevron" size={14} />
				vira uma vaga para você
			</p>

			<div className={cx(card({ size: 'sm' }), 'flex flex-col gap-3', RISE, 'stagger-24')}>
				<div className="flex items-start justify-between gap-3">
					<span className="leading-tight">
						<span className="block font-semibold">Desenvolvedor(a) Front-end</span>
						<span className="block text-sm text-muted">vista no post de Ana Souza</span>
					</span>
					<span className="flex shrink-0 gap-1.5">
						<span className={badge({ size: 'sm' })}>remoto</span>
						<span className={badge({ size: 'sm' })}>PJ</span>
					</span>
				</div>
				<BadgeList aria-label="Tecnologias">
					<li className={badge({ size: 'sm', tone: 'plain', bordered: true })}>React</li>
					<li className={badge({ size: 'sm', tone: 'plain', bordered: true })}>TypeScript</li>
				</BadgeList>
				<span
					className={cx(
						badge({ tone: 'running', size: 'sm' }),
						'self-start animate-pop-in motion-reduce:animate-none stagger-30',
					)}
				>
					<Icon name="check" size={14} />
					currículo ajustado para esta vaga
				</span>
			</div>
		</figure>
	)
}
