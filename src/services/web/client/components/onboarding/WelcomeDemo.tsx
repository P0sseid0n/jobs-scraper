import { useEffect, useState, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { badge, BadgeList } from '../ui/Badge'
import { card } from '../ui/Card'
import { StatusDot } from '../ui/StatusDot'

const RISE = 'animate-rise-in motion-reduce:animate-none'

/** Uma volta até começar a sumir: uns 5 s montando e uns 3,5 s parada no fim, com a vaga pronta. */
const ROUND_MS = 8500
const FADE_MS = 500

/**
 * O que está em andamento e, depois, o resultado, no mesmo lugar: o primeiro sai por cima e o segundo sobe de baixo,
 * como a troca de texto dos botões. Com movimento reduzido, só o resultado.
 */
function Swap({ working, done, outDelay, inDelay }: { working: ReactNode; done: ReactNode; outDelay: string; inDelay: string }) {
	return (
		<span className="grid">
			<span
				className={cx(
					'col-start-1 row-start-1 flex items-center gap-1.5 animate-text-out motion-reduce:hidden',
					outDelay,
				)}
			>
				{working}
			</span>
			<span
				className={cx('col-start-1 row-start-1 flex items-center gap-1.5 animate-text-in motion-reduce:animate-none', inDelay)}
			>
				{done}
			</span>
		</span>
	)
}

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
 * a vaga que sai dele e o currículo sendo ajustado. Toca em loop: parada no fim, com tudo na tela, ficaria texto demais ao lado dos passos.
 * A cada volta some devagar e monta de novo (a `key` nova reinicia as animações); com movimento reduzido, fica pronta.
 */
export function WelcomeDemo() {
	const [round, setRound] = useState(0)
	const [leaving, setLeaving] = useState(false)

	useEffect(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
		const fade = setTimeout(() => setLeaving(true), ROUND_MS)
		const next = setTimeout(() => {
			setLeaving(false)
			setRound(value => value + 1)
		}, ROUND_MS + FADE_MS)
		return () => {
			clearTimeout(fade)
			clearTimeout(next)
		}
	}, [round])

	return (
		<figure
			key={round}
			aria-label="Exemplo: um post do LinkedIn que vira uma vaga"
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
						<span className="block text-xs text-muted">recrutadora · há 2 h</span>
					</span>
				</div>
				{/* A faixa de leitura desce pelo texto, e o marca-texto acende cada trecho logo depois que ela passa */}
				<div className="relative overflow-hidden">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 h-6 bg-linear-to-b from-transparent via-lime/30 to-transparent animate-scan motion-reduce:hidden stagger-11"
					/>
					<p className="text-sm leading-relaxed">
						Estamos contratando! Vaga para <Mark delay="stagger-13">dev front-end</Mark>,{' '}
						<Mark delay="stagger-15">100% remoto</Mark>, contrato <Mark delay="stagger-17">PJ</Mark>. Stack:{' '}
						<Mark delay="stagger-18">React</Mark> e <Mark delay="stagger-20">TypeScript</Mark>. Chama no direct!
					</p>
				</div>
				<span className={cx('border-t border-line pt-2.5 font-mono text-xs text-muted', RISE, 'stagger-8')}>
					<Swap
						outDelay="stagger-27"
						inDelay="stagger-28"
						working={
							<>
								<StatusDot tone="lime" pulse />a IA está lendo o post
							</>
						}
						done={
							<>
								<Icon name="check" size={14} className="text-lime-text" />5 detalhes encontrados
							</>
						}
					/>
				</span>
			</div>

			<p
				aria-hidden="true"
				className={cx('flex items-center gap-1.5 self-center font-mono text-xs text-muted', RISE, 'stagger-31')}
			>
				<Icon name="chevron" size={14} />
				vira uma vaga para você
			</p>

			<div className={cx(card({ size: 'sm' }), 'flex flex-col gap-3', RISE, 'stagger-33')}>
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
						'self-start animate-pop-in motion-reduce:animate-none stagger-39',
					)}
				>
					<Swap
						outDelay="stagger-49"
						inDelay="stagger-50"
						working={
							<>
								<Icon name="spinner" size={14} />
								ajustando o currículo
							</>
						}
						done={
							<>
								<Icon name="check" size={14} />
								currículo ajustado para esta vaga
							</>
						}
					/>
				</span>
			</div>
		</figure>
	)
}
