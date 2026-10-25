/** A pessoa pediu menos movimento no sistema: as animações feitas em JS (não só as do CSS) ficam de fora. */
export function reducedMotion() {
	return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A mesma curva do `--ease-glide` (tailwind.css), para as animações do `element.animate()`. */
export const GLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)'
