import { ref, watchEffect } from 'vue'

import { storage } from '../lib/storage'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'theme'
const systemDark = matchMedia('(prefers-color-scheme: dark)')

export const theme = ref<Theme>(storage.get<Theme>(KEY, 'system'))
const prefersDark = ref(systemDark.matches)
systemDark.addEventListener('change', event => (prefersDark.value = event.matches))

watchEffect(() => {
	const dark = theme.value === 'dark' || (theme.value === 'system' && prefersDark.value)
	document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	storage.set(KEY, theme.value)
})

/** Alterna entre claro e escuro a partir do tema que está na tela. */
export function toggleTheme() {
	theme.value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
}
