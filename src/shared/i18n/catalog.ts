import type { ptBR } from './locales/pt-BR'

/** O catálogo completo, com a forma do `pt-BR` (a base): uma chave que não existe nele quebra o `typecheck`. */
export type Messages = Widen<typeof ptBR>

/** Os textos do `pt-BR` como `string` (uma função que devolve "vaga nova" ou "vagas novas" devolve `string`). */
type Widen<T> = T extends (...args: infer A) => string
	? (...args: A) => string
	: T extends string
		? string
		: T extends readonly (infer U)[]
			? Widen<U>[]
			: { [K in keyof T]: Widen<T[K]> }

/** Um texto do catálogo: fixo, ou uma função quando depende de valores (plural, nomes, números). */
type Leaf = string | ((...args: never[]) => string)

/** Um catálogo da comunidade, que pode estar incompleto: o que falta cai no `en` (ver `messagesFor`). */
export type PartialMessages<T = Messages> = { [K in keyof T]?: T[K] extends Leaf ? T[K] : PartialMessages<T[K]> }

/** As chaves de todos os textos do catálogo, como caminhos ("jobs.empty.title"). */
export function catalogKeys(catalog: object, prefix = ''): string[] {
	return Object.entries(catalog).flatMap(([key, value]) =>
		typeof value === 'object' && value !== null ? catalogKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
	)
}

/** O catálogo `base` com os textos de `override` por cima (os que faltam em `override` ficam os de `base`). */
export function mergeCatalog<T extends object>(base: T, override: PartialMessages<T> | undefined): T {
	if (!override) return base

	const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) }
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue
		const current = merged[key]
		merged[key] =
			// Uma lista (ex.: os itens da abertura) vale inteira: traduzida em parte, ela trocaria a ordem dos textos
			isSection(value) && isSection(current) ? mergeCatalog(current, value as PartialMessages<object>) : value
	}

	return merged as T
}

function isSection(value: unknown): value is object {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
