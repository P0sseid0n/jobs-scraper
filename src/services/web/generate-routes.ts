/**
 * Gera a árvore de rotas do site (`client/routeTree.gen.ts`) a partir dos arquivos de `client/routes/`, com o gerador
 * do TanStack Router e a configuração do `tsr.config.json`. Com `--watch`, gera de novo a cada mudança nas rotas.
 *
 * Usa o gerador direto, e não a CLI (`tsr`), por causa do Windows: a CLI grava num arquivo temporário e o renomeia por
 * cima da árvore, o que falha (EPERM) enquanto o servidor está com ela aberta. Aqui o temporário é copiado por cima.
 */
import { watch } from 'node:fs'
import fsp from 'node:fs/promises'
import { Generator, getConfig } from '@tanstack/router-generator'

type GeneratorFs = NonNullable<ConstructorParameters<typeof Generator>[0]['fs']>

const fs: GeneratorFs = {
	stat: async filePath => {
		const stat = await fsp.stat(filePath, { bigint: true })
		return { mtimeMs: stat.mtimeMs, mode: Number(stat.mode), uid: Number(stat.uid), gid: Number(stat.gid) }
	},
	rename: async (from, to) => {
		await fsp.copyFile(from, to)
		await fsp.rm(from, { force: true })
	},
	writeFile: (filePath, content) => fsp.writeFile(filePath, content),
	readFile: async filePath => {
		try {
			const handle = await fsp.open(filePath, 'r')
			const stat = await handle.stat({ bigint: true })
			const fileContent = (await handle.readFile()).toString()
			await handle.close()
			return { stat, fileContent }
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'file-not-existing'
			throw error
		}
	},
	chmod: (filePath, mode) => fsp.chmod(filePath, mode),
	chown: (filePath, uid, gid) => fsp.chown(filePath, uid, gid),
}

const config = getConfig()
const generator = new Generator({ config, root: process.cwd(), fs })

async function generate() {
	try {
		await generator.run()
	} catch (error) {
		console.error('Não consegui gerar as rotas:', error)
		if (!process.argv.includes('--watch')) process.exit(1)
	}
}

await generate()

if (process.argv.includes('--watch')) {
	console.info(`Gerando as rotas a cada mudança em ${config.routesDirectory}`)
	let timer: ReturnType<typeof setTimeout> | undefined
	// Várias mudanças seguidas (salvar, renomear) geram uma vez só
	watch(config.routesDirectory, { recursive: true }, () => {
		clearTimeout(timer)
		timer = setTimeout(generate, 100)
	})
}
