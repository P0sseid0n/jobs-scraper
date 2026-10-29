import type { TemplateVariable } from '@shared/templates'

/** Os campos do modelo em que o painel "Variáveis disponíveis" insere. */
export type TemplateField = 'subject' | 'body'

/** Variáveis de link viram link na mensagem: no assunto, que é texto puro, elas ficam desativadas. */
export function variableAllowedIn(variable: Pick<TemplateVariable, 'type'>, field: TemplateField | null) {
	return !(field === 'subject' && variable.type === 'link')
}

/**
 * Insere `{{nome}}` no texto, no lugar da seleção (ou na posição do cursor). Sem seleção conhecida, entra no fim.
 * @returns O texto novo e onde o cursor fica (logo depois da variável).
 */
export function insertVariable(value: string, name: string, selection: { start: number; end: number } | null) {
	const token = `{{${name}}}`
	const start = Math.min(selection?.start ?? value.length, value.length)
	const end = Math.max(start, Math.min(selection?.end ?? start, value.length))

	return { value: value.slice(0, start) + token + value.slice(end), cursor: start + token.length }
}
