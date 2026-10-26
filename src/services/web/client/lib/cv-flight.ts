import { reducedMotion } from './motion'

const FLIGHT_MS = 700
/** Quanto o arco sobe acima do ponto mais alto entre a partida e a chegada. */
const ARC_PX = 90
const SAMPLES = 16
const LAND = { duration: 450, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }

/** Ponto `t` (0 a 1) da curva quadrática de `a` a `c`, puxada por `b`. */
const bezier = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c

/**
 * Currículo pedido: uma folhinha sai do botão (`from`, medido no clique) e voa em arco até a bandeja de currículos
 * (`[data-cv-tray]`, no canto), que a engole e dá um pulo. Chamar depois do pedido aceito, quando a bandeja já mostra
 * o pedido (no primeiro, ela acabou de aparecer).
 */
export function flyToTray(from: DOMRect) {
	if (reducedMotion()) return

	// Um quadro depois: a bandeja do primeiro pedido acabou de ser desenhada
	requestAnimationFrame(() => {
		const tray = document.querySelector<HTMLElement>('[data-cv-tray]')
		if (!tray) return

		const to = tray.getBoundingClientRect()
		const sheet = document.createElement('span')
		sheet.setAttribute('aria-hidden', 'true')
		sheet.className =
			'pointer-events-none fixed top-0 left-0 z-50 h-7 w-5.5 rounded-xs border border-lime-accent bg-lime-soft shadow-float'
		document.body.append(sheet)

		const x0 = from.left + from.width / 2 - sheet.offsetWidth / 2
		const y0 = from.top + from.height / 2 - sheet.offsetHeight / 2
		const x2 = to.left + 28 - sheet.offsetWidth / 2
		const y2 = to.top + to.height / 2 - sheet.offsetHeight / 2
		const x1 = (x0 + x2) / 2
		const y1 = Math.min(y0, y2) - ARC_PX

		const frames = Array.from({ length: SAMPLES + 1 }, (_, index) => {
			const t = index / SAMPLES
			const x = bezier(x0, x1, x2, t)
			const y = bezier(y0, y1, y2, t)
			// Gira um pouco no caminho e encolhe ao entrar na bandeja
			const scale = t < 0.15 ? 1 + t * 2 : 1.3 - t * 0.8
			return { transform: `translate(${x}px, ${y}px) rotate(${t * -20}deg) scale(${scale})`, opacity: t > 0.9 ? 0 : 1 }
		})

		const done = () => sheet.remove()
		sheet.animate(frames, { duration: FLIGHT_MS, easing: 'ease-in-out', fill: 'forwards' }).finished.then(() => {
			done()
			tray.animate([{ scale: 1 }, { scale: 1.06 }, { scale: 1 }], LAND)
		}, done)
	})
}
