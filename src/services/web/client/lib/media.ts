import { ref } from 'vue'

/** Se a media query casa agora, atualizado quando a janela muda de tamanho. */
export function useMedia(query: string) {
	const media = matchMedia(query)
	const matches = ref(media.matches)
	media.addEventListener('change', event => (matches.value = event.matches))

	return matches
}

/** Largura em que a lista mostra o detalhe ao lado (painel lateral); abaixo disso, o detalhe é uma página. */
export const wideLayout = useMedia('(min-width: 1100px)')
