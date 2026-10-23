import { useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../../lib/cx'

const TAB = [
	'-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-muted transition',
	'not-aria-selected:hover:text-ink aria-selected:border-ink aria-selected:text-ink dark:aria-selected:border-lime',
].join(' ')

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
		<div role="tablist" aria-label={label} className={cx('flex border-b border-line', className)} onKeyDown={onKeyDown}>
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
		</div>
	)
}

type TabPanelProps = HTMLAttributes<HTMLDivElement> & {
	/** O `id` do `Tabs`. */
	tabsId: string
	value: string
	selected: boolean
}

/** O conteúdo de uma aba. Fora da aba escolhida fica só escondido (não desmonta), e o que foi digitado nele continua. */
export function TabPanel({ tabsId, value, selected, ...props }: TabPanelProps) {
	return (
		<div role="tabpanel" id={`${tabsId}-panel-${value}`} aria-labelledby={`${tabsId}-tab-${value}`} hidden={!selected} {...props} />
	)
}
