/**
 * Runtime de JSX da aplicação (`jsxImportSource` no tsconfig): o do Vue, com uma diferença. Lá, um filho único
 * booleano vira texto (`<td>{cond && <b />}</td>` mostraria "false"); aqui ele é descartado, como no React e no
 * plugin de JSX do Vue para Babel. Assim `cond && <x />` funciona em qualquer lugar.
 */
import { Fragment, h, type VNode } from 'vue'

export type { JSX } from 'vue/jsx-runtime'

type Props = Record<string, unknown> & { children?: unknown }

export function jsx(type: Parameters<typeof h>[0], props: Props, key?: string | number): VNode {
	const { children, ...rest } = props
	if (key !== undefined) rest.key = key

	// biome-ignore lint/suspicious/noExplicitAny: mesma assinatura genérica do `jsx` do Vue
	return h(type as any, rest, typeof children === 'boolean' ? null : (children as any))
}

export { Fragment, jsx as jsxDEV, jsx as jsxs }
