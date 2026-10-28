/**
 * Hover dos elementos com borda e sem preenchimento (Button `ghost`, IconButton `bordered`, Pill e o `check-pill` das
 * configurações): o mesmo em todos, como o card de vaga. Não vale para opção ligada (`aria-pressed`, `aria-current` ou com checkbox
 * marcado) nem desativada. A transição vem do `PRESS`, que todos eles usam.
 */
export const OUTLINED =
	'not-disabled:not-aria-pressed:not-aria-[current=true]:not-has-checked:hover:border-line-strong not-disabled:not-aria-pressed:not-aria-[current=true]:not-has-checked:hover:bg-surface-2'
