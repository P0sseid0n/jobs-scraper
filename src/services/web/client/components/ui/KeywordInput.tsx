import { useState, type KeyboardEvent } from 'react'

import { cx } from '../../lib/cx'
import { Icon } from '../Icon'
import { badge } from './Badge'
import { IconButton } from './IconButton'
import { field, FOCUS_WITHIN } from './Input'

/**
 * Campo de chips: digite e Enter (ou vírgula) para adicionar; Backspace no campo vazio remove o último. Com
 * `keepCase`, mantém a grafia digitada ("Vue.js") e só evita repetir sem diferenciar maiúsculas.
 */
export function KeywordInput({
	id,
	value,
	max,
	maxLength = 50,
	keepCase = false,
	invalid = false,
	describedBy,
	onChange,
}: {
	id: string
	value: string[]
	max: number
	maxLength?: number
	keepCase?: boolean
	invalid?: boolean
	describedBy?: string
	onChange: (value: string[]) => void
}) {
	const [draft, setDraft] = useState('')

	function add() {
		const words = draft
			.split(',')
			.map(word => (keepCase ? word.trim() : word.trim().toLowerCase()))
			.filter(Boolean)
		const next = [...value]

		for (const word of words) {
			const known = next.some(item => item.toLowerCase() === word.toLowerCase())
			if (!known && next.length < max) next.push(word.slice(0, maxLength))
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
		<div className={field({ invalid, className: cx('flex min-h-24 flex-wrap content-start gap-1.5 p-2', FOCUS_WITHIN) })}>
			{value.map(word => (
				<span className={badge({ className: 'gap-0.5 py-0.5 pr-0.5 pl-2.5 text-xs whitespace-normal' })} key={word}>
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
				className="h-7.5 min-w-25 flex-1 basis-30 border-0 bg-transparent text-sm outline-none"
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
