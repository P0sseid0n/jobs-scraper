import { extendTailwindMerge } from 'tailwind-merge'
import { createTV } from 'tailwind-variants'

// Ensina ao tailwind-merge os valores do @theme (tailwind.css) que ele não reconhece sozinho
const twMergeConfig = { extend: { theme: { radius: ['pill'] } } }
const merge = extendTailwindMerge(twMergeConfig)

/**
 * Junta as classes que valem (`cx('card', open && 'open')`). Em conflito entre classes do Tailwind, vence a última:
 * `cx('inline-flex px-4', className)` com `className="hidden"` dá `px-4 hidden`.
 */
export function cx(...classes: (string | false | null | undefined)[]) {
	return merge(classes.filter(Boolean).join(' '))
}

/**
 * Declara as variantes de um componente (`tv({ base, variants, defaultVariants })`), com a mesma resolução de
 * conflitos do `cx`: o `className` passado por fora sempre pode substituir uma classe da variante.
 */
export const tv = createTV({ twMergeConfig })
