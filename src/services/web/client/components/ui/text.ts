/** Rótulo de seção em mono, discreto ("contato", "período"); serve em `h2`, `h3`, `legend` ou `span`. */
export const LABEL = 'font-mono text-xs font-normal text-muted'

/** Informação de apoio em mono, discreta ("postado por …", "idioma: …", datas, nomes de arquivo, contagens). */
export const META = 'font-mono text-xs text-muted'

/** Grupo de opções (`<fieldset>`); a `<legend>` leva o `LEGEND`. */
export const FIELDSET = 'flex flex-col gap-2.5'

/** A `<legend>` de um `FIELDSET`, com a cara do `FieldLabel` e o `mb-2.5` até as opções. */
export const LEGEND = 'mb-2.5 p-0 text-sm font-medium'

/** Lista sem marcador nem recuo (`<ul>`/`<ol>`); o layout dela vai junto (`cx(LIST, 'flex flex-col gap-3')`). */
export const LIST = 'm-0 list-none p-0'

/** Título de um bloco da tela ("histórico de coletas"); a parte em mono ao lado vai sem negrito (`font-normal`). */
export const SECTION_TITLE = 'text-xl font-semibold'
