import { extendTailwindMerge } from 'tailwind-merge'

// Ensina ao tailwind-merge os valores do @theme (tailwind.css) que ele não reconhece sozinho
const merge = extendTailwindMerge({ extend: { theme: { radius: ['pill'] } } })

/**
 * Junta as classes que valem (`cx('btn', big && 'btn-lg')`). Em conflito entre classes do Tailwind, vence a última:
 * `cx('inline-flex px-4', className)` com `className="hidden"` dá `px-4 hidden`.
 */
export function cx(...classes: (string | false | null | undefined)[]) {
	return merge(classes.filter(Boolean).join(' '))
}
