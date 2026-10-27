/**
 * O reflexo que acompanha o mouse (`pointer-glow`, no tailwind.css): passa a posição do mouse, relativa ao elemento com
 * `data-pointer-glow` embaixo dele, para as variáveis `--mx` e `--my`. Um só ouvinte para a página toda.
 */
export function followPointerGlow() {
	document.addEventListener(
		'pointermove',
		event => {
			if (event.pointerType !== 'mouse') return
			const surface = (event.target as Element | null)?.closest?.<HTMLElement>('[data-pointer-glow]')
			if (!surface) return

			const rect = surface.getBoundingClientRect()
			surface.style.setProperty('--mx', `${event.clientX - rect.left}px`)
			surface.style.setProperty('--my', `${event.clientY - rect.top}px`)
		},
		{ passive: true },
	)
}
