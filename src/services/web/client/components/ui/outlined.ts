/**
 * Hover dos elementos com borda e sem preenchimento (Button `ghost`, IconButton `bordered`, Pill e o `check-pill` das
 * configurações): o mesmo em todos, como o card de vaga. Não vale para opção ligada (`aria-pressed`) nem desativada.
 */
export const OUTLINED =
	'transition not-disabled:not-aria-pressed:hover:border-line-strong not-disabled:not-aria-pressed:hover:bg-surface-2'
