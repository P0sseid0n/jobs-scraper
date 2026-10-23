import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { cx } from '../../lib/cx'
import { Input } from './Input'

/** Ignora caixa e acentos ao filtrar ("logis" acha "Logística"). */
function comparable(text: string) {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim()
}

/** A lista aberta embaixo do campo (também a do `SelectMenu`), que abre descendo com mola. */
export const LISTBOX =
	'absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-float origin-top animate-pop-in motion-reduce:animate-none'

/** Uma opção da lista: `active` é a das setas; `selected`, a do valor atual. */
export function listOption(active: boolean, selected: boolean) {
	return cx(
		'cursor-pointer rounded-sm px-3 py-2 text-sm',
		active ? 'bg-surface-2' : 'hover:bg-surface-2',
		selected && 'font-semibold',
	)
}

/** As opções que contêm o texto digitado; sem texto, todas. */
export function filterOptions(options: readonly string[], query: string) {
	const key = comparable(query)
	return key ? options.filter(option => comparable(option).includes(key)) : [...options]
}

/**
 * Campo de texto com uma lista de sugestões, como um select com filtro: a lista abre ao focar o campo, filtra
 * enquanto se digita e aceita qualquer texto (as opções são só sugestões). Setas e Enter escolhem; Esc fecha.
 */
export function Combobox({
	id,
	value,
	options,
	placeholder,
	maxLength,
	invalid = false,
	describedBy,
	onChange,
}: {
	id: string
	value: string
	options: readonly string[]
	placeholder?: string
	maxLength?: number
	invalid?: boolean
	describedBy?: string
	onChange: (value: string) => void
}) {
	const listId = useId()
	const listRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	// Ao abrir, mostra todas as opções; o filtro só vale depois de digitar
	const [filtering, setFiltering] = useState(false)
	const [active, setActive] = useState(-1)

	const visible = filtering ? filterOptions(options, value) : [...options]
	const expanded = open && visible.length > 0

	function show() {
		setOpen(true)
		setFiltering(false)
		setActive(-1)
	}

	function choose(option: string) {
		onChange(option)
		setOpen(false)
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault()
			if (!open) return show()
			if (visible.length === 0) return
			const step = event.key === 'ArrowDown' ? 1 : -1
			setActive(current => (current + step + visible.length) % visible.length)
		} else if (event.key === 'Enter' && expanded && visible[active]) {
			event.preventDefault()
			choose(visible[active])
		} else if (event.key === 'Escape' && expanded) {
			event.preventDefault()
			setOpen(false)
		}
	}

	// A opção escolhida pelas setas fica visível na lista
	useEffect(() => {
		if (active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
	}, [active])

	return (
		<div className="relative">
			<Input
				id={id}
				role="combobox"
				autoComplete="off"
				aria-autocomplete="list"
				aria-expanded={expanded}
				aria-controls={listId}
				aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
				aria-describedby={describedBy}
				className="w-full"
				value={value}
				placeholder={placeholder}
				maxLength={maxLength}
				invalid={invalid}
				onFocus={show}
				onClick={() => !open && show()}
				onBlur={() => setOpen(false)}
				onKeyDown={onKeyDown}
				onChange={event => {
					onChange(event.target.value)
					setOpen(true)
					setFiltering(true)
					setActive(-1)
				}}
			/>
			<div ref={listRef} id={listId} role="listbox" hidden={!expanded} className={LISTBOX}>
				{visible.map((option, index) => (
					// biome-ignore lint/a11y/useKeyWithClickEvents: pelo teclado, as setas e o Enter no campo escolhem a opção
					<div
						key={option}
						id={`${listId}-${index}`}
						role="option"
						// O foco fica no campo (aria-activedescendant); a opção só precisa ser focável
						tabIndex={-1}
						aria-selected={index === active}
						className={listOption(index === active, option === value)}
						// Sem tirar o foco do campo (o blur fecharia a lista antes do clique)
						onMouseDown={event => event.preventDefault()}
						onClick={() => choose(option)}
					>
						{option}
					</div>
				))}
			</div>
		</div>
	)
}
