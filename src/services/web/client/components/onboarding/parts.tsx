import type { ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
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

/**
 * Os botões do fim do passo: "voltar" à esquerda e a ação principal à direita. No celular, ficam presos embaixo da
 * tela, para o "continuar" estar sempre à mão.
 */
export function StepActions({ onBack, children, order = 5 }: { onBack?: () => void; children: ReactNode; order?: number }) {
	return (
		<Rise
			order={order}
			className="flex flex-wrap items-center gap-3 border-t border-line pt-6 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:bg-bg max-md:px-4 max-md:pt-3 max-md:pb-safe-3"
		>
			{onBack && (
				<Button variant="ghost" onClick={onBack}>
					<Icon name="back" />
					voltar
				</Button>
			)}
			<div className="ml-auto flex flex-wrap items-center justify-end gap-3">{children}</div>
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
