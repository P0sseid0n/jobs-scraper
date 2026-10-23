/** Importações de CSS: o Bun empacota o arquivo junto da página. */
declare module '*.css'

/** Importações de `.tex` com `with { type: 'text' }`: o conteúdo do arquivo como texto. */
declare module '*.tex' {
	const text: string
	export default text
}
