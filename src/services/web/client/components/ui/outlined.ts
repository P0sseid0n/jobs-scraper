/**
 * Hover dos elementos com borda e sem preenchimento (Button `ghost`, IconButton `bordered`, Pill e o `check-pill` das
 * configurações): o mesmo em todos, como o card de vaga. Não vale para opção ligada (`aria-pressed` ou com checkbox
 * marcado) nem desativada.
 */
export const OUTLINED =
	'transition not-disabled:not-aria-pressed:not-has-checked:hover:border-line-strong not-disabled:not-aria-pressed:not-has-checked:hover:bg-surface-2'
