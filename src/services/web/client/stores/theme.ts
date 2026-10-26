import { GLIDE, reducedMotion } from '../lib/motion'
import { storage } from '../lib/storage'
import { createStore } from '../lib/store'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'theme'
const systemDark = matchMedia('(prefers-color-scheme: dark)')

export const theme = createStore<Theme>(storage.get<Theme>(KEY, 'system'))

function apply() {
	const dark = theme.get() === 'dark' || (theme.get() === 'system' && systemDark.matches)
	document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	storage.set(KEY, theme.get())
}

apply()
theme.subscribe(apply)
systemDark.addEventListener('change', apply)

const REVEAL_MS = 550

/**
 * Alterna entre claro e escuro a partir do tema que está na tela. Com o botão que trocou (`origin`), o tema novo
 * aparece num círculo que cresce dele até cobrir a tela (View Transitions; sem elas, ou com menos movimento, troca direto).
 */
export function toggleTheme(origin?: HTMLElement) {
	const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
	if (!origin || !document.startViewTransition || reducedMotion()) return theme.set(next)

	const rect = origin.getBoundingClientRect()
	const x = rect.left + rect.width / 2
	const y = rect.top + rect.height / 2
	// Até o canto mais longe do botão
	const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

	const transition = document.startViewTransition(() => theme.set(next))
	void transition.ready.then(
		() => {
			document.documentElement.animate(
				{ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
				{ duration: REVEAL_MS, easing: GLIDE, pseudoElement: '::view-transition-new(root)' },
			)
		},
		() => {},
	)
}
