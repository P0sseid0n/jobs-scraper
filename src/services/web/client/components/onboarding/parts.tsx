import { useLayoutEffect, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { createStore, useStore } from '../../lib/store'
import { Icon, type IconName } from '../Icon'
import { Button } from '../ui/Button'

/**
 * Um bloco que sobe do fundo ao aparecer; `order` atrasa a chegada em degraus (`stagger-*`), para os blocos de uma tela
 * chegarem um depois do outro. Sem animação para quem pede menos movimento.
 */
export function Rise({ order = 0, className, children }: { order?: number; className?: string; children: ReactNode }) {
	return <div className={cx('animate-rise-in motion-reduce:animate-none', STAGGER[order], className)}>{children}</div>
}

// As classes inteiras, para o Tailwind encontrar no código
const STAGGER = ['stagger-0', 'stagger-1', 'stagger-2', 'stagger-3', 'stagger-4', 'stagger-5', 'stagger-6', 'stagger-7']

/** A abertura do passo: "passo 2 de 5", o título grande e a explicação, chegando um depois do outro. */
export function StepHeading({ eyebrow, title, lead }: { eyebrow?: string; title: ReactNode; lead?: ReactNode }) {
	return (
		<header className="flex flex-col gap-3">
			{eyebrow && (
				<Rise>
					<p className="font-mono text-xs text-lime-text">{eyebrow}</p>
				</Rise>
			)}
			<Rise order={1}>
				<h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">{title}</h1>
			</Rise>
			{lead && (
				<Rise order={2}>
					<p className="max-w-160 text-base text-pretty text-muted">{lead}</p>
				</Rise>
			)}
		</header>
	)
}

/** Um botão da barra do passo. */
export type StepButton = {
	label: string
	onClick: () => void
	disabled?: boolean
	/** Ícone antes do texto; `trailingIcon`, depois (ex.: a seta do "começar"). */
	icon?: IconName
	trailingIcon?: IconName
	/** Só a ação principal: `ghost` quando ela é secundária de fato (ex.: "pular por agora"). */
	variant?: 'lime' | 'ghost'
}

/** O que a barra de baixo mostra no passo atual: "voltar", os botões extras e a ação principal. */
export type StepBarState = {
	onBack?: () => void
	/** Texto ao lado, quando não há "voltar" (ex.: "leva uns 5 minutos"). */
	hint?: string
	secondary?: StepButton[]
	primary: StepButton
}

const stepBar = createStore<StepBarState | null>(null)

/**
 * Diz à barra de baixo o que mostrar enquanto o passo está na tela. A barra fica fora do passo (que entra animado a cada
 * troca): os botões não somem e voltam, só o texto muda, com a troca animada do `Button`.
 */
export function useStepBar(state: StepBarState) {
	// A cada render, sem dependências: os textos e o "desabilitado" mudam com o passo. Só a barra renderiza de novo.
	useLayoutEffect(() => stepBar.set(state))
}

/**
 * A barra com os botões do passo atual, embaixo do formulário: "voltar" à esquerda e a ação principal à direita. Presa
 * no rodapé da tela enquanto o passo rola, para o "continuar" estar sempre à mão.
 */
export function StepBar() {
	const state = useStore(stepBar)
	if (!state) return null

	return (
		<Rise
			order={5}
			className="sticky bottom-0 z-10 mt-9 flex flex-wrap items-center gap-3 border-t border-line bg-bg pt-6 pb-6 max-md:-mx-4 max-md:px-4 max-md:pt-3 max-md:pb-safe-3"
		>
			{state.onBack ? (
				<Button variant="ghost" onClick={state.onBack}>
					<Icon name="back" />
					voltar
				</Button>
			) : (
				state.hint && <span className="text-sm text-muted">{state.hint}</span>
			)}
			<div className="ml-auto flex flex-wrap items-center justify-end gap-3">
				{state.secondary?.map((button, index) => (
					<Button key={index} variant="ghost" disabled={button.disabled} onClick={button.onClick}>
						{button.icon && <Icon name={button.icon} />}
						{button.label}
					</Button>
				))}
				<Button
					variant={state.primary.variant ?? 'lime'}
					size="lg"
					disabled={state.primary.disabled}
					onClick={state.primary.onClick}
				>
					{state.primary.icon && <Icon name={state.primary.icon} />}
					{state.primary.label}
					{state.primary.trailingIcon && <Icon name={state.primary.trailingIcon} className="rotate-180" />}
				</Button>
			</div>
		</Rise>
	)
}

/** Uma opção grande, para escolher o caminho (ex.: preencher o formulário ou enviar o arquivo). */
export function ChoiceCard({
	title,
	description,
	badge,
	onClick,
}: {
	title: string
	description: string
	badge?: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-5 text-left transition-press hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float active:scale-98"
		>
			<span className="flex w-full items-center justify-between gap-3">
				<span className="text-base font-semibold">{title}</span>
				<Icon
					name="back"
					className="rotate-180 text-muted transition duration-300 ease-spring group-hover:translate-x-1 group-hover:text-ink"
				/>
			</span>
			<span className="text-sm text-muted">{description}</span>
			{badge && <span className="rounded-pill bg-lime-soft px-2.5 py-0.5 font-mono text-xs text-lime-text">{badge}</span>}
		</button>
	)
}
