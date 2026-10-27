/** A pessoa pediu menos movimento no sistema: as animações feitas em JS (não só as do CSS) ficam de fora. */
export function reducedMotion() {
	return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A mesma curva do `--ease-glide` (tailwind.css), para as animações do `element.animate()`. */
export const GLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Os campos marcados como inválidos (`aria-invalid`) dentro de `root` tremem, como o código recusado do LinkedIn. Chamar
 * depois de salvar com erro: espera um quadro, para os erros novos já estarem na tela.
 */
export function shakeInvalid(root: () => ParentNode | null) {
	if (reducedMotion()) return

	requestAnimationFrame(() => {
		for (const field of root()?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? []) {
			field.animate(
				[
					{ translate: '0' },
					{ translate: '-6px 0' },
					{ translate: '6px 0' },
					{ translate: '-6px 0' },
					{ translate: '6px 0' },
					{ translate: '0' },
				],
				{
					duration: 420,
					easing: 'ease-in-out',
				},
			)
		}
	})
}
