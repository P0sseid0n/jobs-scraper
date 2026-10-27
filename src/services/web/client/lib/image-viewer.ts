/** Distância mínima (px) de um deslize horizontal para trocar de imagem. */
const SWIPE_MIN_PX = 50

/** A imagem depois de andar `step` a partir de `index`, voltando ao começo depois da última (e ao fim antes da primeira). */
export function stepImage(index: number, step: number, count: number) {
	return (((index + step) % count) + count) % count
}

/**
 * O passo de um deslize no toque: para a esquerda avança (+1), para a direita volta (-1), e `0` quando o gesto foi
 * curto ou mais vertical que horizontal (rolagem, toque para fechar).
 */
export function swipeStep(dx: number, dy: number) {
	if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return 0
	return dx < 0 ? 1 : -1
}
