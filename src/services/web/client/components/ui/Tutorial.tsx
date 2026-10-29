import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { DIALOG } from './Dialog'
import { IconButton } from './IconButton'
import { TabPanel, Tabs } from './Tabs'
import { TextLink } from './TextLink'

/** Um passo do tutorial: o que fazer, em uma linha, e o detalhe de onde clicar. */
export type TutorialStep = {
	/** Liga o passo a quem aponta para ele (ex.: o teste que falhou destaca o passo da senha de app). */
	id: string
	title: string
	text?: string
	/** A página do serviço onde o passo acontece; abre em outra aba. */
	link?: { href: string; label: string }
	/** Os valores para copiar no formulário ou no serviço (ex.: servidor e porta). */
	values?: { label: string; value: string }[]
}

/** Um caminho do tutorial (ex.: Gmail ou Outlook); com mais de um, cada caminho vira uma aba. */
export type TutorialPath = { id: string; label: string; steps: TutorialStep[] }

type TutorialProps = {
	/** Prefixo dos ids das abas e dos passos: único na tela. */
	id: string
	title: string
	intro?: ReactNode
	paths: TutorialPath[]
	/** O caminho que abre escolhido (o primeiro, sem ele); acompanha quando muda (ex.: o domínio do e-mail digitado). */
	path?: string
	/** O passo em destaque: recebe o foco e fica à vista ao mudar. */
	highlight?: string
	/** Mostra o botão de fechar; o Esc dentro do tutorial também fecha. */
	onClose?: () => void
	className?: string
}

/**
 * O passo a passo para configurar algo fora do site, em passos numerados, com o link para a página certa de cada
 * serviço. Com mais de um caminho, as abas escolhem o caminho.
 */
export function Tutorial({ id, title, intro, paths, path, highlight, onClose, className }: TutorialProps) {
	const [selected, setSelected] = useState(path ?? paths[0]?.id ?? '')
	useEffect(() => {
		if (path) setSelected(path)
	}, [path])

	const titleId = `${id}-title`
	const steps = useRef<HTMLOListElement | null>(null)

	// O passo apontado ganha o foco: quem usa leitor de tela ouve o passo, e quem enxerga o vê destacado
	useEffect(() => {
		if (!highlight) return
		const step = steps.current?.querySelector<HTMLElement>(`[data-step="${highlight}"]`)
		step?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
		step?.focus({ preventScroll: true })
	}, [highlight, selected])

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !onClose) return
		event.preventDefault()
		onClose()
	}

	return (
		// O `tabIndex` deixa focar o tutorial que acabou de abrir (o botão que o abriu some)
		<section
			id={id}
			tabIndex={-1}
			aria-labelledby={titleId}
			className={cx('flex flex-col gap-4 outline-none', className)}
			onKeyDown={onKeyDown}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id={titleId} className="text-base font-semibold">
						{title}
					</h2>
					{intro && <p className="text-sm text-pretty text-muted">{intro}</p>}
				</div>
				{onClose && (
					<IconButton label="Fechar o passo a passo" size="sm" className="-mt-1 -mr-1.5" onClick={onClose}>
						<Icon name="close" />
					</IconButton>
				)}
			</div>

			{paths.length > 1 && (
				<Tabs
					id={`${id}-paths`}
					label="Caminhos"
					items={paths.map(item => ({ value: item.id, label: item.label }))}
					selected={selected}
					onSelect={setSelected}
				/>
			)}

			{paths.map(item => {
				const list = (
					<ol
						ref={item.id === selected ? steps : undefined}
						className="m-0 flex list-none flex-col gap-1 p-0"
						aria-label={paths.length > 1 ? undefined : 'Passos'}
					>
						{item.steps.map((step, index) => (
							<Step key={step.id} step={step} number={index + 1} highlighted={step.id === highlight} />
						))}
					</ol>
				)

				return paths.length > 1 ? (
					<TabPanel key={item.id} tabsId={`${id}-paths`} value={item.id} selected={item.id === selected}>
						{list}
					</TabPanel>
				) : (
					<div key={item.id}>{list}</div>
				)
			})}
		</section>
	)
}

function Step({ step, number, highlighted }: { step: TutorialStep; number: number; highlighted: boolean }) {
	return (
		<li
			data-step={step.id}
			tabIndex={highlighted ? -1 : undefined}
			aria-current={highlighted ? 'step' : undefined}
			className={cx('flex gap-3 rounded-md p-2.5 outline-none transition', highlighted && 'bg-lime-soft ring-1 ring-lime-accent')}
		>
			<span
				aria-hidden="true"
				className={cx(
					'grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold',
					highlighted ? 'bg-lime text-lime-ink' : 'bg-surface-2 text-muted',
				)}
			>
				{number}
			</span>
			<div className="flex min-w-0 grow flex-col gap-1.5 pt-0.5">
				<p className="text-sm font-semibold">{step.title}</p>
				{step.text && <p className="text-sm text-pretty text-muted">{step.text}</p>}
				{step.values && (
					<dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1 rounded-sm bg-surface-2 px-3 py-2 text-sm max-md:grid-cols-1">
						{step.values.map(value => (
							<div key={value.label} className="contents">
								<dt className="text-muted">{value.label}</dt>
								<dd className="m-0 font-mono wrap-anywhere max-md:mb-1">{value.value}</dd>
							</div>
						))}
					</dl>
				)}
				{step.link && (
					<TextLink href={step.link.href} external className="self-start text-sm">
						{step.link.label}
					</TextLink>
				)}
			</div>
		</li>
	)
}

/**
 * O tutorial numa modal (`<dialog>` nativo: foco preso, Esc e o clique fora fecham). Abre ao montar, por cima da tela:
 * o que já foi digitado embaixo continua lá.
 */
export function TutorialDialog({ onClose, ...props }: Omit<TutorialProps, 'onClose' | 'id'> & { onClose: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	const id = useId()

	useEffect(() => {
		ref.current?.showModal()
	}, [])

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, o Esc já fecha o <dialog>
		<dialog
			ref={ref}
			className={cx(DIALOG, 'w-160')}
			aria-labelledby={`${id}-title`}
			onClose={onClose}
			// Clique no fundo escurecido (fora do conteúdo) fecha
			onClick={event => event.target === ref.current && ref.current.close()}
		>
			<Tutorial {...props} id={id} className="px-5 pt-4 pb-5" onClose={() => ref.current?.close()} />
		</dialog>
	)
}
