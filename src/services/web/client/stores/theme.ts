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

/** Alterna entre claro e escuro a partir do tema que está na tela. */
export function toggleTheme() {
	theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
}
