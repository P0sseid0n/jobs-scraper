/** Limpa os espaços sem colar palavras, mantendo as quebras de linha (no máximo uma linha em branco seguida). */
export function cleanPostText(text: string) {
	return text
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
