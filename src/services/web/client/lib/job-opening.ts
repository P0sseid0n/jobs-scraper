import { GLIDE, reducedMotion } from './motion'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Quando cada parte da abertura começa e quanto dura (ms): a borda direita do card acende do centro para as pontas, a
 * faixa atravessa até o painel, a borda esquerda dele acende a partir de onde ela chegou, o painel brilha e o conteúdo
 * entra. Depois, as linhas somem.
 */
const CARD_EDGE = { delay: 0, duration: 180 }
const LINK = { delay: 120, duration: 200 }
const PANEL_EDGE = { delay: 280, duration: 320 }
const GLOW = { delay: 300, duration: 900 }
const FADE = { delay: 560, duration: 260 }
/** O conteúdo do detalhe entra junto com o brilho do painel; sem painel (celular), na hora. */
const CONTENT_DELAY = 300
const CONTENT = { duration: 380, step: 40, offset: 10 }
/** Afastada das bordas arredondadas, onde a linha reta não acompanha o contorno. */
const EDGE_INSET = 14
/** O raio das curvas da faixa quando o card está acima ou abaixo da altura do painel. */
const CORNER = 10

/** A abertura pedida no clique, que o detalhe completa quando aparece; expira se a navegação não acontecer. */
let opening: { delay: number; at: number } | null = null
const OPENING_TTL_MS = 1500

/** O painel do detalhe ao lado da lista (desktop), se estiver ao lado mesmo (não quebrou para baixo). */
function sidePanel(card: HTMLElement) {
	const panel = document.querySelector<HTMLElement>('[data-job-panel]')
	if (!panel) return null

	return panel.getBoundingClientRect().left > card.getBoundingClientRect().right ? panel : null
}

/** Os traços da abertura, recalculados a cada quadro: a tela ainda pode estar mudando (os filtros fechando). */
function paths(card: DOMRect, panel: DOMRect) {
	const x0 = card.right - 0.5
	const x1 = panel.left + 0.5
	const y0 = Math.min(Math.max(card.top + card.height / 2, 0), innerHeight)
	const y1 = Math.min(Math.max(y0, panel.top + EDGE_INSET * 2), panel.bottom - EDGE_INSET * 2)
	const middle = (x0 + x1) / 2

	const rise = y1 - y0
	const radius = Math.min(CORNER, Math.abs(rise) / 2, (x1 - x0) / 2)
	const sign = Math.sign(rise)
	const link =
		Math.abs(rise) < 1
			? `M${x0} ${y0}H${x1}`
			: `M${x0} ${y0}H${middle - radius}Q${middle} ${y0} ${middle} ${y0 + sign * radius}V${y1 - sign * radius}Q${middle} ${y1} ${middle + radius} ${y1}H${x1}`

	return {
		cardUp: `M${x0} ${y0}V${card.top + EDGE_INSET}`,
		cardDown: `M${x0} ${y0}V${card.bottom - EDGE_INSET}`,
		link,
		panelUp: `M${x1} ${y1}V${panel.top + EDGE_INSET}`,
		panelDown: `M${x1} ${y1}V${panel.bottom - EDGE_INSET}`,
	}
}

function draw(path: SVGPathElement, { delay, duration }: { delay: number; duration: number }) {
	path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay, duration, easing: GLIDE, fill: 'both' })
}

/** A faixa lime do card até o painel, que acende a borda dele e brilha. */
function beam(card: HTMLElement, panel: HTMLElement) {
	const style = getComputedStyle(panel)
	const accent = style.getPropertyValue('--color-lime-accent').trim()
	const glow = style.getPropertyValue('--color-lime-glow').trim()
	const line = style.borderLeftColor

	const svg = document.createElementNS(SVG_NS, 'svg')
	svg.setAttribute('aria-hidden', 'true')
	Object.assign(svg.style, {
		position: 'fixed',
		inset: '0',
		width: '100%',
		height: '100%',
		pointerEvents: 'none',
		zIndex: '40',
		overflow: 'visible',
		filter: `drop-shadow(0 0 4px ${glow})`,
	})

	const shapes = paths(card.getBoundingClientRect(), panel.getBoundingClientRect())
	const elements = Object.fromEntries(
		Object.keys(shapes).map(name => {
			const path = document.createElementNS(SVG_NS, 'path')
			path.setAttribute('pathLength', '1')
			path.setAttribute('fill', 'none')
			Object.assign(path.style, { stroke: accent, strokeWidth: '2.5', strokeLinecap: 'round', strokeDasharray: '1' })
			svg.append(path)
			return [name, path]
		}),
	) as Record<keyof typeof shapes, SVGPathElement>

	// O painel pode ser trocado por outro na navegação (em `/` ele é o da primeira vaga, de outra rota): vale o da tela
	const shownPanel = () => {
		const current = document.querySelector<HTMLElement>('[data-job-panel]')
		return current?.isConnected ? current : panel
	}
	let lastPanel = panel.getBoundingClientRect()
	const update = () => {
		const current = shownPanel()
		if (current.isConnected) lastPanel = current.getBoundingClientRect()
		const next = paths(card.getBoundingClientRect(), lastPanel)
		for (const name of Object.keys(next) as (keyof typeof next)[]) elements[name].setAttribute('d', next[name])
	}
	update()
	document.body.append(svg)

	draw(elements.cardUp, CARD_EDGE)
	draw(elements.cardDown, CARD_EDGE)
	draw(elements.link, LINK)
	draw(elements.panelUp, PANEL_EDGE)
	draw(elements.panelDown, PANEL_EDGE)

	// O painel acende de uma vez quando a faixa chega e o brilho se apaga
	setTimeout(() => {
		shownPanel().animate(
			[
				{ borderColor: accent, boxShadow: `0 0 0 3px ${glow}, 0 0 32px ${glow}` },
				{ borderColor: line, boxShadow: '0 0 0 0 transparent, 0 0 0 transparent' },
			],
			{ duration: GLOW.duration, easing: 'ease-out' },
		)
	}, GLOW.delay)

	let frame = requestAnimationFrame(function follow() {
		update()
		frame = requestAnimationFrame(follow)
	})
	svg.animate([{ opacity: 1 }, { opacity: 0 }], {
		delay: FADE.delay,
		duration: FADE.duration,
		easing: 'ease-in',
		fill: 'forwards',
	}).finished.finally(() => {
		cancelAnimationFrame(frame)
		svg.remove()
	})
}

/**
 * No clique no card da lista (antes da navegação): no desktop, a faixa lime liga o card ao painel do detalhe, que
 * acende; o conteúdo da vaga entra quando aparece (`revealJobDetail`). No celular, sem painel, só o conteúdo entra.
 */
export function openJobFromCard(card: HTMLElement) {
	if (reducedMotion()) return

	const panel = sidePanel(card)
	if (panel) beam(card, panel)
	opening = { delay: panel ? CONTENT_DELAY : 0, at: performance.now() }
}

/** Ao montar o detalhe de uma vaga: se ela foi aberta pelo card, os blocos do conteúdo entram um depois do outro. */
export function revealJobDetail(content: HTMLElement) {
	const current = opening
	opening = null
	if (!current || performance.now() - current.at > OPENING_TTL_MS) return

	for (const [index, child] of [...content.children].entries()) {
		child.animate(
			[
				{ opacity: 0, transform: `translateY(${CONTENT.offset}px)` },
				{ opacity: 1, transform: 'none' },
			],
			{
				delay: current.delay + index * CONTENT.step,
				duration: CONTENT.duration,
				easing: GLIDE,
				fill: 'backwards',
			},
		)
	}
}
