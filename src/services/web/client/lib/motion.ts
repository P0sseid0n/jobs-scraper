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
		for (const field of root()?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? []) shake(field)
	})
}

/** O tremor do `animate-shake` (tailwind.css), para as animações do `element.animate()`. */
export function shake(element: HTMLElement, delay = 0) {
	if (reducedMotion()) return

	element.animate(
		[
			{ translate: '0' },
			{ translate: '-6px 0' },
			{ translate: '6px 0' },
			{ translate: '-6px 0' },
			{ translate: '6px 0' },
			{ translate: '0' },
		],
		{ duration: 420, delay, easing: 'ease-in-out' },
	)
}

/**
 * Até quanto depois do clique o erro ainda é da ação dele: o resultado que chega depois pelo stream (o "processar de
 * novo" terminado no scraper) não treme o botão clicado por último, que pode ser de outra coisa.
 */
const TRIGGER_WINDOW_MS = 10_000

/** O último botão (ou link) acionado, por clique ou pelo envio de um formulário. */
let lastTrigger: { element: HTMLElement; at: number } | null = null

if (typeof document !== 'undefined') {
	document.addEventListener(
		'click',
		event => {
			const element = (event.target as Element | null)?.closest?.<HTMLElement>('button, a, [role="button"], [role="menuitem"]')
			if (element) lastTrigger = { element, at: performance.now() }
		},
		true,
	)
	// O Enter num campo envia o formulário sem clique: o botão de envio é quem pediu a ação
	document.addEventListener(
		'submit',
		event => {
			const submitter = (event as SubmitEvent).submitter
			if (submitter) lastTrigger = { element: submitter, at: performance.now() }
		},
		true,
	)
}

/**
 * Treme o botão que pediu a ação que acabou de falhar: o último acionado, se foi há pouco e ainda está na tela. Cada
 * clique treme uma vez só.
 * @returns `false` se não havia botão para tremer (a modal fechou, o erro não veio de um clique): quem chamou treme
 * outra coisa, como o aviso do erro.
 */
export function shakeFailedAction() {
	const trigger = lastTrigger
	lastTrigger = null
	if (!trigger || performance.now() - trigger.at > TRIGGER_WINDOW_MS) return false
	if (!trigger.element.isConnected || !trigger.element.checkVisibility()) return false

	shake(trigger.element)
	return true
}
