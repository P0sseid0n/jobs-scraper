// Monta dist/artifact/project/: os arquivos do design system do Claude Design, no formato do tipo "Design System",
// prontos para publicar. Roda depois do build.ts (`bun design-system`).
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { GUIDES } from './guides'

const dir = import.meta.dir
const dist = join(dir, 'dist')
const project = join(dist, 'artifact', 'project')

rmSync(project, { recursive: true, force: true })

function put(path: string, content: string | Buffer) {
	const file = join(project, path)
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, content)
}

put('README.md', readFileSync(join(dir, 'brand.md')))
// A origem fica registrada no tokens.json publicado (o design system a mostra numa nova sincronização)
const ref = Bun.spawnSync(['git', 'rev-parse', '--short', 'HEAD'], { cwd: dir }).stdout.toString().trim()
const tokens = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'))
tokens.meta = {
	source: 'github',
	repo: 'P0sseid0n/jobs-scraper',
	ref: `main@${ref}`,
	package: 'src/services/web/design-system',
	paths: { tokens: ['src/services/web/client/tailwind.css'], docs: ['src/services/web/design-system/brand.md'] },
	components: Object.fromEntries(Object.keys(GUIDES).map(name => [name, 'src/services/web/design-system/index.ts'])),
	synced: new Date().toISOString().slice(0, 10),
}
put('tokens.json', `${JSON.stringify(tokens, null, '\t')}\n`)
put('components/Cover/preview.html', readFileSync(join(dir, 'cover.html')))
for (const file of ['bundle.js', 'bundle.css', 'index.d.ts']) copyFileSync(join(dist, file), join(project, 'components', file))

const previews = readdirSync(join(dir, 'previews')).filter(file => file.endsWith('.html'))
for (const file of previews) {
	const name = file.replace(/\.html$/, '')
	const guide = GUIDES[name]
	if (!guide) throw new Error(`Falta a orientação de ${name} em guides.ts`)
	put(`components/${name}/preview.html`, readFileSync(join(dir, 'previews', file)))
	put(`components/${name}/README.md`, `# ${name}\n\n${guide}\n`)
}

console.log(`dist/artifact/project/: ${previews.length} componentes, capa, tokens e README`)
