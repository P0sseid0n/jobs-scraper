import { createStore, useStore } from './store'

/** Se a media query casa agora, atualizado quando a janela muda de tamanho. */
function mediaStore(query: string) {
	const media = matchMedia(query)
	const store = createStore(media.matches)
	media.addEventListener('change', event => store.set(event.matches))

	return store
}

/** Largura em que a lista mostra o detalhe ao lado (painel lateral); abaixo disso, o detalhe é uma página. */
export const wideLayout = mediaStore('(min-width: 1100px)')

export function useWideLayout() {
	return useStore(wideLayout)
}

/** Toque como entrada principal (celular, tablet): ali o compartilhar do sistema é o jeito comum de mandar algo. */
export const coarsePointer = mediaStore('(pointer: coarse)')

export function useCoarsePointer() {
	return useStore(coarsePointer)
}
