// Texto do botão "ver mais" (`expandable-text-button`), que o innerText inclui no fim do post. O post já vem inteiro.
const SEE_MORE_SUFFIX = /\s*…\s*(mais|more|ver mais|see more)\s*$/i

/**
 * Limpa os espaços sem colar palavras, mantendo as quebras de linha (no máximo uma linha em branco seguida),
 * e remove o "… mais" do fim.
 */
export function cleanPostText(text: string) {
	return text
		.replace(SEE_MORE_SUFFIX, '')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
