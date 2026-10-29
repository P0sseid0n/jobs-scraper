import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { Button } from './Button'
import { DIALOG } from './Dialog'
import { IconButton } from './IconButton'
import { Notice } from './Notice'
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
export type TutorialPath = {
	id: string
	label: string
	/** Um aviso antes dos passos: para quem o caminho não serve (ex.: as contas pessoais da Microsoft). */
	notice?: string
	steps: TutorialStep[]
}

type TutorialProps = {
	/** Prefixo dos ids das abas e dos passos: único na tela. */
	id: string
	title: string
	intro?: ReactNode
	paths: TutorialPath[]
	/**
	 * O caminho escolhido fora do tutorial (ex.: o provedor escolhido na conta de e-mail): sem as abas, para não haver duas
	 * escolhas da mesma coisa. Sem ele, as abas escolhem, começando pelo primeiro.
	 */
	path?: string
	/** O passo em destaque: vai para ele, com o foco, ao mudar (ex.: o teste que falhou aponta o passo que resolve). */
	highlight?: string
	/** A animação do passo, ao lado do texto (acima dele, no estreito); sem ela, só o texto. */
	scene?: (path: string, step: TutorialStep) => ReactNode
	/** Mostra o botão de fechar; o Esc dentro do tutorial também fecha. */
	onClose?: () => void
	/** O nome do botão de fechar, quando fechar faz mais que fechar este (ex.: esconde os tutoriais de todas as contas). */
	closeLabel?: string
	/** No último passo, o botão no lugar do "próximo" (ex.: "ir para os campos"), que leva para o que vem depois. */
	done?: { label: string; onClick: () => void }
	className?: string
}

/**
 * O passo a passo para configurar algo fora do site: um passo por vez, na horizontal, com a animação do passo de um
 * lado e, do outro, o que fazer e o link para a página certa do serviço. Os números no topo levam a qualquer passo; com
 * mais de um caminho, as abas escolhem o caminho (ou quem usa, com `path`).
 */
export function Tutorial({
	id,
	title,
	intro,
	paths,
	path,
	highlight,
	scene,
	onClose,
	closeLabel = 'Fechar o passo a passo',
	done,
	className,
}: TutorialProps) {
	const [selected, setSelected] = useState(path ?? paths[0]?.id ?? '')
	const [current, setCurrent] = useState(0)
	// O passo novo entra pelo lado para onde se andou, como os passos do onboarding
	const [direction, setDirection] = useState<'next' | 'back'>('next')
	const stage = useRef<HTMLElement>(null)

	const active = paths.find(item => item.id === selected) ?? paths[0]
	const steps = active?.steps ?? []
	const index = Math.min(current, Math.max(steps.length - 1, 0))

	function selectPath(next: string) {
		setSelected(next)
		setCurrent(0)
	}

	function go(next: number, focus = false) {
		setDirection(next >= index ? 'next' : 'back')
		setCurrent(next)
		// O foco vai para o passo: o leitor de tela lê o passo novo
		if (focus) requestAnimationFrame(() => stage.current?.focus({ preventScroll: true }))
	}

	useEffect(() => {
		if (path) selectPath(path)
	}, [path])

	// O passo apontado abre com o foco: quem usa leitor de tela ouve o passo, e quem enxerga o vê destacado
	useEffect(() => {
		const target = highlight ? steps.findIndex(step => step.id === highlight) : -1
		if (target < 0) return
		go(target, true)
		stage.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
	}, [highlight, selected])

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !onClose) return
		event.preventDefault()
		onClose()
	}

	const titleId = `${id}-title`
	const step = steps[index]
	const tabs = !path && paths.length > 1

	const body = active && step && (
		<>
			{active.notice && (
				<Notice tone="warn" icon="alert">
					<p className="text-sm">{active.notice}</p>
				</Notice>
			)}

			{/* Os passos, numerados e ligados por uma linha: o atual em destaque, os anteriores com o check */}
			<ol className="m-0 flex list-none items-center p-0" aria-label="Passos">
				{steps.map((item, number) => (
					<li key={item.id} className={cx('flex items-center', number > 0 && 'grow')}>
						{number > 0 && (
							<span
								aria-hidden="true"
								className={cx('mx-1.5 h-px grow transition-colors', number <= index ? 'bg-ink' : 'bg-line')}
							/>
						)}
						<button
							type="button"
							aria-label={`Passo ${number + 1}: ${item.title}`}
							aria-current={number === index ? 'step' : undefined}
							onClick={() => go(number, true)}
							className={cx(
								'grid size-7 shrink-0 place-items-center rounded-full border font-mono text-xs transition duration-300 ease-spring',
								number === index
									? 'border-ink bg-ink text-bg'
									: number < index
										? 'border-line text-lime-text hover:border-ink'
										: 'border-line text-muted hover:border-ink hover:text-ink',
								item.id === highlight && number !== index && 'border-lime-accent',
							)}
						>
							{number < index ? <Icon name="check" size={14} /> : number + 1}
						</button>
					</li>
				))}
			</ol>

			{/* O passo entra de lado: o que passa da borda é cortado, sem rolagem na horizontal (o recuo deixa o anel do destaque) */}
			<div className="-mx-1 overflow-x-clip px-1 py-1">
				<Stage
					key={`${active.id}-${step.id}`}
					ref={stage}
					step={step}
					number={index + 1}
					total={steps.length}
					direction={direction}
					highlighted={step.id === highlight}
					scene={scene?.(active.id, step)}
				/>
			</div>

			<div className="flex items-center justify-between gap-3">
				<Button variant="ghost" size="sm" disabled={index === 0} onClick={() => go(index - 1, true)}>
					<Icon name="back" />
					anterior
				</Button>
				{index === steps.length - 1 && done ? (
					<Button variant="ghost" size="sm" onClick={done.onClick}>
						{done.label}
						<Icon name="forward" />
					</Button>
				) : (
					<Button variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => go(index + 1, true)}>
						próximo
						<Icon name="forward" />
					</Button>
				)}
			</div>
		</>
	)

	return (
		// O `tabIndex` deixa focar o tutorial que acabou de abrir (o botão que o abriu some)
		<section
			id={id}
			tabIndex={-1}
			aria-labelledby={titleId}
			className={cx('@container flex flex-col gap-4 outline-none', className)}
			onKeyDown={onKeyDown}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					<h2 id={titleId} className="text-base font-semibold">
						{title}
						{/* Sem as abas, o título diz qual caminho está na tela (ex.: o provedor escolhido na conta) */}
						{!tabs && paths.length > 1 && active && <span className="font-normal text-muted"> · {active.label}</span>}
					</h2>
					{/* No estreito (celular), sem a introdução: o título e os passos bastam, e os campos ficam mais perto */}
					{intro && <p className="text-sm text-pretty text-muted @max-xl:hidden">{intro}</p>}
				</div>
				{onClose && (
					<IconButton label={closeLabel} size="sm" className="-mt-1 -mr-1.5" onClick={onClose}>
						<Icon name="close" />
					</IconButton>
				)}
			</div>

			{tabs && (
				<Tabs
					id={`${id}-paths`}
					label="Caminhos"
					items={paths.map(item => ({ value: item.id, label: item.label }))}
					selected={selected}
					onSelect={selectPath}
				/>
			)}

			{tabs ? (
				paths.map(item => (
					<TabPanel
						key={item.id}
						tabsId={`${id}-paths`}
						value={item.id}
						selected={item.id === selected}
						className="flex flex-col gap-4"
					>
						{item.id === selected && body}
					</TabPanel>
				))
			) : (
				<div className="flex flex-col gap-4">{body}</div>
			)}
		</section>
	)
}

/**
 * Um passo: a animação de um lado e o texto do outro (com pouco espaço, a animação fica em cima). Entra pelo lado para
 * onde se andou; focável, para o leitor de tela ler o passo ao trocar.
 */
function Stage({
	ref,
	step,
	number,
	total,
	direction,
	highlighted,
	scene,
}: {
	ref: Ref<HTMLElement>
	step: TutorialStep
	number: number
	total: number
	direction: 'next' | 'back'
	highlighted: boolean
	scene: ReactNode
}) {
	return (
		<article
			ref={ref}
			tabIndex={-1}
			aria-label={`Passo ${number} de ${total}: ${step.title}`}
			className={cx(
				'grid items-center gap-5 rounded-md outline-none motion-reduce:animate-none',
				!!scene && '@xl:grid-cols-2',
				direction === 'next' ? 'animate-step-next' : 'animate-step-back',
			)}
		>
			{scene}
			<div className={cx('flex min-w-0 flex-col gap-2', highlighted && 'rounded-md bg-lime-soft p-3 ring-1 ring-lime-accent')}>
				{highlighted && <p className="font-mono text-xs text-lime-text">este passo costuma resolver o erro</p>}
				<p className="text-base font-semibold text-balance">{step.title}</p>
				{step.text && <p className="text-sm text-pretty text-muted">{step.text}</p>}
				{step.values && (
					<dl className="m-0 flex flex-col gap-1 rounded-sm bg-surface-2 px-3 py-2 text-sm">
						{step.values.map(value => (
							<div key={value.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
								<dt className="text-muted">{value.label}</dt>
								<dd className="m-0 font-mono">{value.value}</dd>
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
		</article>
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
		// O showModal foca a seção do tutorial (focável, sem contorno): o foco vai para o fechar, como nas outras modais
		ref.current?.querySelector<HTMLElement>('button[aria-label]')?.focus()
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
			<Tutorial
				{...props}
				id={id}
				className="px-5 pt-4 pb-5"
				onClose={() => ref.current?.close()}
				// O último passo fecha a modal e devolve a pessoa aos campos
				done={
					props.done && {
						label: props.done.label,
						onClick: () => {
							ref.current?.close()
							props.done?.onClick()
						},
					}
				}
			/>
		</dialog>
	)
}
