/**
 * Instâncias isoladas da aplicação inteira no Docker, para testar do zero (ex.: o onboarding) sem mexer na instalação
 * principal: `bun instance <nome>`. Cada instância é um projeto do Docker Compose (`jobs-instancia-<nome>`), com os
 * próprios volumes (banco, filas, sessão do LinkedIn, modelo da IA e cache do LaTeX) e a própria pasta em
 * `data/instancias/<nome>/` (o `.env` e o currículo). Roda uma por vez: subir uma para as outras e a principal, porque
 * todas usam as mesmas portas.
 *
 *   bun instance <nome>                  cria (do zero, com o .env.example) ou liga a instância
 *   bun instance <nome> --importar-env   o mesmo, com uma cópia do .env atual (numa existente, troca o .env dela)
 *   bun instance <nome> --parar          desliga a instância (os dados ficam)
 *   bun instance <nome> --apagar         apaga os volumes e a pasta da instância
 *   bun instance --listar                lista as instâncias
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '../..')
const INSTANCES_DIR = path.join(ROOT, 'data', 'instancias')
const MAIN_ENV = path.join(ROOT, '.env')
const PROJECT_PREFIX = 'jobs-instancia-'
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
// As portas publicadas pelo docker-compose.yml (site, RabbitMQ, mongo-express, MongoDB e Ollama)
const PORTS = [3000, 5672, 8081, 15672, 27017, 11434]
// Variáveis que o script controla no .env de cada instância
const MANAGED_KEYS = ['COMPOSE_PROJECT_NAME', 'ENV_FILE', 'DATA_DIR']
// Usuários e senhas que o Mongo e o RabbitMQ só gravam ao criar o volume: numa instância existente, ficam os dela
const VOLUME_CREDENTIAL_KEYS = ['RABBITMQ_USER', 'RABBITMQ_PASSWORD', 'MONGO_USER', 'MONGO_PASSWORD']

const args = Bun.argv.slice(2)
const flags = new Set(args.filter(arg => arg.startsWith('--')))
const name = args.find(arg => !arg.startsWith('--'))

try {
	if (flags.has('--listar')) await list()
	else {
		if (!name || !NAME_PATTERN.test(name)) {
			fail('Informe o nome da instância (letras minúsculas, números e hífen), ex.: bun instance teste-onboarding')
		}
		if (flags.has('--parar')) await stop(name)
		else if (flags.has('--apagar')) await remove(name)
		else await start(name, flags.has('--importar-env'))
	}
} catch (error) {
	fail((error as Error).message)
}

async function start(name: string, importEnv: boolean) {
	const envFile = instanceEnv(name)
	const exists = existsSync(envFile)

	if (!exists || importEnv) {
		await mkdir(path.join(instanceDir(name), 'cv', 'generated'), { recursive: true })
		await writeFile(envFile, await buildEnv(name, importEnv))
		console.log(
			exists
				? '📄 .env da instância trocado pelo .env atual (as configurações já salvas no banco dela continuam valendo)'
				: `✨ Instância nova "${name}", do zero${importEnv ? ', com uma cópia do .env atual' : ''}`,
		)
	} else {
		console.log(`▶️  Ligando a instância "${name}", com o que já foi configurado nela`)
	}

	await stopOtherProjects(project(name))
	await ensurePortsFree()

	await compose(name, ['up', '-d', '--build'])
	console.log(`\n✅ Instância "${name}" no ar: http://localhost:3000`)
	if (!exists) console.log('   Na primeira vez, o modelo da IA é baixado só para ela (uns 3,4 GB).')
	console.log(`   Desligar: bun instance ${name} --parar · apagar: bun instance ${name} --apagar`)
}

async function stop(name: string) {
	assertExists(name)
	await compose(name, ['stop'])
	console.log(`⏹️  Instância "${name}" desligada. A principal volta com: docker compose up -d`)
}

async function remove(name: string) {
	assertExists(name)

	const answer = prompt(`Isso apaga o banco, as vagas, a IA e a pasta da instância "${name}". Digite o nome para confirmar:`)
	if (answer?.trim() !== name) fail('Nada foi apagado.')

	await compose(name, ['down', '-v', '--remove-orphans'])
	await rm(instanceDir(name), { recursive: true, force: true })
	console.log(`🗑️  Instância "${name}" apagada`)
}

async function list() {
	const names = existsSync(INSTANCES_DIR)
		? (await readdir(INSTANCES_DIR, { withFileTypes: true }))
				.filter(entry => entry.isDirectory() && existsSync(instanceEnv(entry.name)))
				.map(entry => entry.name)
		: []

	if (names.length === 0) {
		console.log('Nenhuma instância. Crie uma com: bun instance <nome>')
		return
	}

	for (const instance of names) {
		const running = (await runningContainers(project(instance))).length > 0
		console.log(`${running ? '🟢 ligada  ' : '⚪ parada  '} ${instance}`)
	}
}

/**
 * O .env da instância: o `.env.example` (do zero) ou uma cópia do `.env` atual, com o nome do projeto e as pastas dela.
 * Do zero, a linha `COMPOSE_FILE` do `.env` atual vem junto, para a instância usar a GPU como a principal. Importado
 * numa instância que já existe, os usuários e senhas do Mongo e do RabbitMQ continuam os dela (os volumes já os têm).
 */
async function buildEnv(name: string, importEnv: boolean) {
	if (importEnv && !existsSync(MAIN_ENV)) throw new Error('Não há .env na pasta do projeto para importar')

	const base = await readFile(importEnv ? MAIN_ENV : path.join(ROOT, '.env.example'), 'utf8')
	const previous = existsSync(instanceEnv(name)) ? (await readFile(instanceEnv(name), 'utf8')).split(/\r?\n/) : []
	const previousLine = (key: string) => previous.find(line => line.startsWith(`${key}=`))

	const lines = base
		.split(/\r?\n/)
		.filter(line => !MANAGED_KEYS.some(key => line.startsWith(`${key}=`)))
		.map(line => {
			const key = VOLUME_CREDENTIAL_KEYS.find(key => line.startsWith(`${key}=`))
			return (key && previousLine(key)) || line
		})

	if (!importEnv && existsSync(MAIN_ENV)) {
		const composeFile = (await readFile(MAIN_ENV, 'utf8')).split(/\r?\n/).find(line => line.startsWith('COMPOSE_FILE='))
		if (composeFile) lines.unshift(composeFile)
	}

	const relativeDir = path.relative(ROOT, instanceDir(name)).replaceAll('\\', '/')
	return [
		`# Instância "${name}" (bun instance): gerado pelo script; as linhas abaixo apontam para os dados dela`,
		`COMPOSE_PROJECT_NAME=${project(name)}`,
		`ENV_FILE=${relativeDir}/.env`,
		`DATA_DIR=./${relativeDir}`,
		'',
		...lines,
	].join('\n')
}

/** Desliga os outros projetos deste compose que estão rodando (instâncias e a principal), por causa das portas. */
async function stopOtherProjects(current: string) {
	const ids = await output(['docker', 'ps', '-q', '--filter', `label=com.docker.compose.project.working_dir=${ROOT}`])
	const projects = new Set<string>()

	for (const id of ids.split(/\s+/).filter(Boolean)) {
		const name = await output(['docker', 'inspect', '-f', '{{ index .Config.Labels "com.docker.compose.project" }}', id])
		if (name.trim() !== current) projects.add(name.trim())
	}

	for (const other of projects) {
		console.log(`⏸️  Desligando "${other}" (as portas são as mesmas)`)
		await run(['docker', 'stop', ...(await runningContainers(other))], 'ignore')
	}
}

/** Fora do Docker (ex.: `bun dev` da instalação principal), uma porta ocupada impediria a instância de subir. */
async function ensurePortsFree() {
	const busy: number[] = []
	for (const port of PORTS) {
		try {
			Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } }).stop(true)
		} catch {
			busy.push(port)
		}
	}
	if (busy.length > 0) {
		throw new Error(
			`Porta(s) ${busy.join(', ')} em uso por outro programa (o bun dev, ou um container de outra pasta?). Encerre e tente de novo.`,
		)
	}
}

async function runningContainers(projectName: string) {
	const ids = await output(['docker', 'ps', '-q', '--filter', `label=com.docker.compose.project=${projectName}`])
	return ids.split(/\s+/).filter(Boolean)
}

function compose(name: string, command: string[]) {
	return run(['docker', 'compose', '--env-file', instanceEnv(name), '--profile', 'app', ...command])
}

async function run(command: string[], stdout: 'inherit' | 'ignore' = 'inherit') {
	const proc = Bun.spawn(command, { cwd: ROOT, env: await childEnv(), stdio: ['inherit', stdout, 'inherit'] })
	if ((await proc.exited) !== 0) throw new Error(`Falhou: ${command.join(' ')}`)
}

async function output(command: string[]) {
	const proc = Bun.spawn(command, { cwd: ROOT, stdout: 'pipe', stderr: 'inherit' })
	const text = await new Response(proc.stdout).text()
	if ((await proc.exited) !== 0) throw new Error(`Falhou: ${command.join(' ')}`)
	return text
}

/**
 * O ambiente do `docker compose` sem as variáveis que o Bun carregou sozinho do `.env` da pasta: no Compose, uma
 * variável do ambiente vale mais que a do `--env-file`, e a instância herdaria as senhas e contas da principal.
 */
async function childEnv() {
	const loaded = new Set<string>()
	for (const file of ['.env', '.env.local']) {
		const full = path.join(ROOT, file)
		if (!existsSync(full)) continue
		for (const line of (await readFile(full, 'utf8')).split(/\r?\n/)) {
			const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]
			if (key) loaded.add(key)
		}
	}
	return Object.fromEntries(Object.entries(process.env).filter(([key]) => !loaded.has(key)))
}

function assertExists(name: string) {
	if (!existsSync(instanceEnv(name))) fail(`A instância "${name}" não existe. Veja as que existem com: bun instance --listar`)
}

function project(name: string) {
	return `${PROJECT_PREFIX}${name}`
}

function instanceDir(name: string) {
	return path.join(INSTANCES_DIR, name)
}

function instanceEnv(name: string) {
	return path.join(instanceDir(name), '.env')
}

function fail(message: string): never {
	console.error(`❌ ${message}`)
	process.exit(1)
}
