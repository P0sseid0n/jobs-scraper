import type { ReactNode } from 'react'

import { SwitchField } from './ui/Switch'

/**
 * O interruptor das coletas automáticas, nas configurações e nas coletas: ligado = coletando, como os outros
 * interruptores (o `paused` salvo é o contrário).
 */
export function AutoRunsSwitch({
	id,
	paused,
	disabled,
	description,
	onPausedChange,
}: {
	id: string
	paused: boolean
	disabled?: boolean
	description?: ReactNode
	onPausedChange: (paused: boolean) => void
}) {
	return (
		<SwitchField
			id={id}
			title="coletas automáticas"
			description={description}
			checked={!paused}
			disabled={disabled}
			onChange={on => onPausedChange(!on)}
		/>
	)
}
