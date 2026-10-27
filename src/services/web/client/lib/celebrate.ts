import { reducedMotion } from './motion'

const PIECES = 16
const DURATION_MS = 1100
/** Lime, lime escuro e creme: as cores do site, sem arco-íris. */
const COLORS = ['var(--color-lime)', 'var(--color-lime-accent)', 'var(--color-surface-2)', 'var(--color-lime-soft)']

/**
 * Comemoração discreta, para um momento só (o currículo ficou pronto, a primeira vaga chegou): algumas partículas
 * sobem de `from`, se abrindo em leque, giram e somem. Criadas direto no DOM, por cima de tudo.
 */
export function celebrate(from: Element) {
	if (reducedMotion()) return

	const rect = from.getBoundingClientRect()
	const x = rect.left + rect.width / 2
	const y = rect.top + rect.height / 3

	for (let index = 0; index < PIECES; index++) {
		const piece = document.createElement('span')
		piece.setAttribute('aria-hidden', 'true')
		const size = 5 + Math.random() * 5
		Object.assign(piece.style, {
			position: 'fixed',
			left: `${x}px`,
			top: `${y}px`,
			width: `${size}px`,
			height: `${index % 3 === 0 ? size * 1.8 : size}px`,
			borderRadius: index % 2 ? '999px' : '2px',
			background: COLORS[index % COLORS.length],
			boxShadow: '0 0 0 1px rgb(0 0 0 / 0.06)',
			pointerEvents: 'none',
			zIndex: '60',
		})
		document.body.append(piece)

		// Em leque para cima, uns mais longe que outros; caem um pouco no fim, como papel
		const angle = (-90 + (Math.random() - 0.5) * 120) * (Math.PI / 180)
		const distance = 60 + Math.random() * 80
		const dx = Math.cos(angle) * distance
		const dy = Math.sin(angle) * distance
		const spin = (Math.random() - 0.5) * 540

		piece
			.animate(
				[
					{ transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 1 },
					{
						transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`,
						opacity: 1,
						offset: 0.6,
					},
					{
						transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 30}px)) scale(0.8) rotate(${spin}deg)`,
						opacity: 0,
					},
				],
				{ duration: DURATION_MS + Math.random() * 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', delay: Math.random() * 80 },
			)
			.finished.then(
				() => piece.remove(),
				() => piece.remove(),
			)
	}
}
