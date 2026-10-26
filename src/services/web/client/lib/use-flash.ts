import { useEffect, useRef, useState } from 'react'

const FLASH_MS = 1600

/** Um estado que liga por um instante (o "salvo ✓" no botão depois de salvar) e desliga sozinho. */
export function useFlash() {
	const [on, setOn] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

	useEffect(() => () => clearTimeout(timer.current), [])

	function flash() {
		clearTimeout(timer.current)
		setOn(true)
		timer.current = setTimeout(() => setOn(false), FLASH_MS)
	}

	return [on, flash] as const
}
