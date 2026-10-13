import { useState, type KeyboardEvent } from 'react'

import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { badge } from './ui/Badge'
import { IconButton } from './ui/IconButton'

/** Interruptor liga/desliga (checkbox nativo, acessível pelo teclado). */
export function Switch({
	checked,
	label,
	id,
	disabled = false,
	onChange,
}: {
	checked: boolean
	label: string
	id?: string
	disabled?: boolean
	onChange: (value: boolean) => void
}) {
	return (
		<input
			type="checkbox"
			role="switch"
			id={id}
			className="switch"
			aria-checked={checked}
			aria-label={label}
			checked={checked}
			disabled={disabled}
			onChange={event => onChange(event.target.checked)}
		/>
	)
}

/** Campo de chips: digite e Enter (ou vírgula) para adicionar; Backspace no campo vazio remove o último. */
export function KeywordInput({
	id,
	value,
	max,
	maxLength = 50,
	invalid = false,
	describedBy,
	onChange,
}: {
	id: string
	value: string[]
	max: number
	maxLength?: number
	invalid?: boolean
	describedBy?: string
	onChange: (value: string[]) => void
}) {
	const [draft, setDraft] = useState('')

	function add() {
		const words = draft
			.split(',')
			.map(word => word.trim().toLowerCase())
			.filter(Boolean)
		const next = [...value]

		for (const word of words) {
			if (!next.includes(word) && next.length < max) next.push(word.slice(0, maxLength))
		}
		if (next.length !== value.length) onChange(next)
		setDraft('')
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault()
			add()
		} else if (event.key === 'Backspace' && !draft && value.length) {
			onChange(value.slice(0, -1))
		}
	}

	return (
		<div className={cx('chips-input', invalid && 'invalid')}>
			{value.map(word => (
				<span className={badge({ className: 'gap-0.5 py-0.5 pr-0.5 pl-2.5 text-[12px] whitespace-normal' })} key={word}>
					{word}
					<IconButton
						label={`Remover ${word}`}
						size="xs"
						className="text-muted hover:text-ink"
						onClick={() => onChange(value.filter(item => item !== word))}
					>
						<Icon name="close" size={12} />
					</IconButton>
				</span>
			))}
			<input
				id={id}
				value={draft}
				onChange={event => setDraft(event.target.value)}
				onKeyDown={onKeyDown}
				onBlur={add}
				placeholder={value.length >= max ? `limite de ${max}` : 'digite e Enter'}
				disabled={value.length >= max}
				maxLength={maxLength}
				aria-describedby={describedBy}
				aria-invalid={invalid}
			/>
		</div>
	)
}
