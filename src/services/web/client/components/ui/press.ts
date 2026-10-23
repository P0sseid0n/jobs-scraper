/**
 * Clique dos botões (Button, IconButton, Pill): afunda rápido ao apertar e volta com uma mola que passa um pouco do
 * tamanho. `scale-*` muda o quanto afunda (um botão pequeno aguenta mais). Desativado não se mexe.
 */
export const PRESS =
	'transition duration-300 ease-spring not-disabled:active:scale-96 not-disabled:active:duration-75 not-disabled:active:ease-out'
