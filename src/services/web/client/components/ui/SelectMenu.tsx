import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { LISTBOX, listOption } from './Combobox'
import { field } from './Input'

export type SelectMenuOption<V extends string> = { value: V; label: string }

/**
 * Seleção com a mesma lista do `Combobox`, no lugar do `<select>` (cuja lista aberta é a do sistema e não segue o
 * tema). Só aceita as opções dadas. Clique, Enter, Espaço ou as setas abrem; setas, Home e End andam; Enter ou Espaço
 * escolhem; Esc fecha.
 */
export function SelectMenu<V extends string>({
	id,
	value,
	options,
	invalid = false,
	describedBy,
	className,
	onChange,
}: {
	id: string
	value: V
	options: readonly SelectMenuOption<V>[]
	invalid?: boolean
	describedBy?: string
	className?: string
	onChange: (value: V) => void
}) {
	const listId = useId()
	const listRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)

	const selectedIndex = options.findIndex(option => option.value === value)

	// Ao abrir, a opção ativa é a do valor atual
	function show() {
		setOpen(true)
		setActive(Math.max(selectedIndex, 0))
	}

	function choose(option: SelectMenuOption<V>) {
		onChange(option.value)
		setOpen(false)
	}

	function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const last = options.length - 1
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			if (!open) return show()
			const step = event.key === 'ArrowDown' ? 1 : -1
			setActive(current => Math.min(Math.max(current + step, 0), last))
		} else if ((event.key === 'Home' || event.key === 'End') && open) {
			event.preventDefault()
			setActive(event.key === 'Home' ? 0 : last)
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			if (!open) return show()
			if (options[active]) choose(options[active])
		} else if (event.key === 'Escape' && open) {
			event.preventDefault()
			setOpen(false)
		}
	}

	// A opção escolhida pelas setas fica visível na lista
	useEffect(() => {
		if (open && active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
	}, [open, active])

	return (
		<div className={cx('relative', className)}>
			<button
				type="button"
				id={id}
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listId}
				aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
				aria-describedby={describedBy}
				aria-invalid={invalid || undefined}
				className={field({ invalid, className: 'flex w-full cursor-pointer items-center justify-between gap-2 text-left' })}
				onClick={() => (open ? setOpen(false) : show())}
				onBlur={() => setOpen(false)}
				onKeyDown={onKeyDown}
			>
				<span className="truncate">{options[selectedIndex]?.label}</span>
				<Icon name="chevron" className={cx('text-muted transition-transform', open && 'rotate-180')} />
			</button>
			<div ref={listRef} id={listId} role="listbox" hidden={!open} className={LISTBOX}>
				{options.map((option, index) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, as setas e o Enter no botão escolhem a opção
					<div
						key={option.value}
						id={`${listId}-${index}`}
						role="option"
						// O foco fica no botão (aria-activedescendant); a opção só precisa ser focável
						tabIndex={-1}
						aria-selected={index === selectedIndex}
						className={listOption(index === active, index === selectedIndex)}
						// Sem tirar o foco do botão (o blur fecharia a lista antes do clique)
						onMouseDown={event => event.preventDefault()}
						onMouseEnter={() => setActive(index)}
						onClick={() => choose(option)}
					>
						{option.label}
					</div>
				))}
			</div>
		</div>
	)
}
