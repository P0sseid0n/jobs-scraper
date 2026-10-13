// Gera os arquivos de código do design system do Claude Design em dist/: bundle.js (um script clássico que põe os
// componentes em window.JobsScraperUI e usa o React da página), bundle.css (o Tailwind compilado) e index.d.ts.
// Rode da raiz: `bun design-system` (veja o README desta pasta).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BunPlugin } from 'bun'
import tailwind from 'bun-plugin-tailwind'

const NAMESPACE = 'JobsScraperUI'
const dir = import.meta.dir
const outdir = join(dir, 'dist')

// No canvas, o React 18 já está na página: o bundle usa o window.React em vez de levar uma cópia
const pageReact: BunPlugin = {
	name: 'page-react',
	setup(build) {
		build.onResolve({ filter: /^react(\/jsx-(dev-)?runtime)?$/ }, () => ({ path: 'react', namespace: 'page-react' }))
		build.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({ path: 'react-dom', namespace: 'page-react' }))
		build.onLoad({ filter: /^react$/, namespace: 'page-react' }, () => ({
			loader: 'js',
			// O JSX automático vira createElement, com a key fora das props e os filhos estáticos espalhados
			contents: `var R = window.React
function props(p, k) { var o = {}; for (var x in p) if (x !== 'children') o[x] = p[x]; if (k !== undefined) o.key = k; return o }
function jsx(t, p, k) { var c = p && p.children; return c === undefined ? R.createElement(t, props(p, k)) : R.createElement(t, props(p, k), c) }
function jsxs(t, p, k) { return R.createElement.apply(R, [t, props(p, k)].concat(p.children)) }
module.exports = Object.assign({}, R, { jsx: jsx, jsxs: jsxs, jsxDEV: function (t, p, k, s) { return (s ? jsxs : jsx)(t, p, k) } })`,
		}))
		build.onLoad({ filter: /^react-dom$/, namespace: 'page-react' }, () => ({
			loader: 'js',
			contents: 'module.exports = window.ReactDOM',
		}))
	},
}

rmSync(outdir, { recursive: true, force: true })

const js = await Bun.build({
	entrypoints: [join(dir, 'global.ts')],
	format: 'iife',
	target: 'browser',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
	plugins: [pageReact],
})
const css = await Bun.build({ entrypoints: [join(dir, 'ds.css')], plugins: [tailwind] })
for (const result of [js, css]) {
	if (!result.success) {
		for (const log of result.logs) console.error(log)
		process.exit(1)
	}
}

// Um componente por arquivo em types/ (<Comp>.d.ts, com a interface <Comp>Props): a lista do cabeçalho e o index.d.ts
const typeFiles = readdirSync(join(dir, 'types'))
	.filter(file => file.endsWith('.d.ts'))
	.sort()
const components = typeFiles.map(file => file.replace(/\.d\.ts$/, ''))
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: NAMESPACE, components: components.map(name => ({ name })) })} */`
const bundle = await js.outputs[0]!.text()
if (/<\/script|<!--/i.test(bundle)) throw new Error('O bundle tem </script ou <!--, que quebram o script inline')
const types = typeFiles.map(file => readFileSync(join(dir, 'types', file), 'utf8').trim())

mkdirSync(outdir, { recursive: true })
writeFileSync(join(outdir, 'bundle.js'), `${header}\n${bundle}`)
writeFileSync(join(outdir, 'bundle.css'), await css.outputs[0]!.text())
writeFileSync(join(outdir, 'index.d.ts'), `import type * as React from 'react'\n\n${types.join('\n\n')}\n`)

console.log(`dist/: bundle.js (${components.length} componentes), bundle.css e index.d.ts`)
