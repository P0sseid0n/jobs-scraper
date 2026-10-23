import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../../lib/cx'
import { PRESS } from './press'
import { useSlidingIndicator } from './sliding-indicator'

const TAB = cx(
	'-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-muted',
	PRESS,
	'not-disabled:active:scale-95 not-aria-selected:hover:text-ink aria-selected:text-ink',
)

type TabsProps<K extends string> = {
	/** Prefixo dos ids das abas e dos painéis; o mesmo do `TabPanel`. */
	id: string
	/** Nome da lista para o leitor de tela (ex.: "Contas"). */
	label: string
	items: readonly { value: K; label: ReactNode }[]
	selected: K
	onSelect: (value: K) => void
	className?: string
}

/**
 * Abas sublinhadas (o padrão de abas do WAI-ARIA): setas, Home e End trocam de aba, e o Tab vai direto para o painel.
 * O conteúdo de cada aba vai num `TabPanel` com o mesmo `id`.
 */
export function Tabs<K extends string>({ id, label, items, selected, onSelect, className }: TabsProps<K>) {
	const tabs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({})
	const { container, box } = useSlidingIndicator<HTMLDivElement>('[aria-selected="true"]', selected)

	function onKeyDown(event: KeyboardEvent) {
		const index = items.findIndex(item => item.value === selected)
		const next = {
			ArrowRight: (index + 1) % items.length,
			ArrowLeft: (index - 1 + items.length) % items.length,
			Home: 0,
			End: items.length - 1,
		}[event.key]
		if (next === undefined) return

		event.preventDefault()
		const value = items[next]!.value
		onSelect(value)
		tabs.current[value]?.focus()
	}

	return (
		<div
			ref={container}
			role="tablist"
			aria-label={label}
			className={cx('relative flex border-b border-line', className)}
			onKeyDown={onKeyDown}
		>
			{items.map(item => (
				<button
					key={item.value}
					ref={element => {
						tabs.current[item.value] = element
					}}
					type="button"
					role="tab"
					id={`${id}-tab-${item.value}`}
					aria-selected={item.value === selected}
					aria-controls={`${id}-panel-${item.value}`}
					tabIndex={item.value === selected ? 0 : -1}
					className={TAB}
					onClick={() => onSelect(item.value)}
				>
					{item.label}
				</button>
			))}
			{/* O sublinhado da aba escolhida, que desliza até a nova (borda: continua visível no alto contraste do Windows) */}
			{box && (
				<span
					aria-hidden="true"
					className={cx(
						'pointer-events-none absolute -bottom-px left-0 h-0 border-b-2 border-ink dark:border-lime',
						box.slide && 'transition-all duration-500 ease-glide motion-reduce:transition-none',
					)}
					style={{ translate: `${box.left}px 0`, width: box.width }}
				/>
			)}
		</div>
	)
}

type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
	/** O `id` do `Tabs`. */
	tabsId: string
	value: string
	selected: boolean
}

/**
 * O conteúdo de uma aba, que entra subindo de leve. Fora da aba escolhida fica só escondido (não desmonta), e o que foi
 * digitado nele continua.
 */
export function TabPanel({ tabsId, value, selected, className, ...props }: TabPanelProps) {
	return (
		<div
			role="tabpanel"
			id={`${tabsId}-panel-${value}`}
			aria-labelledby={`${tabsId}-tab-${value}`}
			hidden={!selected}
			{...props}
			// A animação roda de novo cada vez que o painel deixa de estar escondido
			className={cx('animate-panel-in motion-reduce:animate-none', className)}
		/>
	)
}
