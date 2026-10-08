import type { GithubRepo } from './github-repositories'

/**
 * Nomes de exibição de tecnologias conhecidas (chave = como aparece em topics/dependências/linguagens do GitHub).
 * Topics e dependências fora desta lista não viram tecnologia no currículo (ex.: "scoreboard", "eslint").
 */
const TECH_NAMES: Record<string, string> = {
	vue: 'Vue.js',
	vuejs: 'Vue.js',
	nuxt: 'Nuxt.js',
	nuxtjs: 'Nuxt.js',
	'nuxt-ui': 'Nuxt UI',
	'@nuxt/ui': 'Nuxt UI',
	pinia: 'Pinia',
	vuex: 'Vuex',
	'vue-router': 'Vue Router',
	vuetify: 'Vuetify',
	quasar: 'Quasar',
	react: 'React',
	'react-native': 'React Native',
	expo: 'Expo',
	next: 'Next.js',
	nextjs: 'Next.js',
	svelte: 'Svelte',
	angular: 'Angular',
	'@angular/core': 'Angular',
	vite: 'Vite',
	tailwindcss: 'Tailwind CSS',
	sass: 'SASS',
	express: 'Express',
	nestjs: 'NestJS',
	'@nestjs/core': 'NestJS',
	'@adonisjs/core': 'AdonisJS',
	adonisjs: 'AdonisJS',
	fastify: 'Fastify',
	elysia: 'Elysia',
	elysiajs: 'Elysia',
	'eden-treaty': 'Eden Treaty',
	'@elysiajs/eden': 'Eden Treaty',
	bun: 'Bun',
	nodejs: 'Node.js',
	node: 'Node.js',
	deno: 'Deno',
	prisma: 'Prisma',
	'@prisma/client': 'Prisma',
	mongoose: 'MongoDB',
	mongodb: 'MongoDB',
	mysql: 'MySQL',
	mysql2: 'MySQL',
	pg: 'PostgreSQL',
	postgresql: 'PostgreSQL',
	postgres: 'PostgreSQL',
	redis: 'Redis',
	ioredis: 'Redis',
	supabase: 'Supabase',
	'@supabase/supabase-js': 'Supabase',
	firebase: 'Firebase',
	graphql: 'GraphQL',
	'socket.io': 'Socket.IO',
	'socket-io': 'Socket.IO',
	websocket: 'WebSocket',
	ws: 'WebSocket',
	amqplib: 'RabbitMQ',
	rabbitmq: 'RabbitMQ',
	puppeteer: 'Puppeteer',
	'puppeteer-extra': 'Puppeteer',
	playwright: 'Playwright',
	'discord.js': 'Discord.js',
	ollama: 'Ollama',
	openai: 'OpenAI',
	'@google/genai': 'Google GenAI',
	'google-genai': 'Google GenAI',
	langchain: 'LangChain',
	jest: 'Jest',
	vitest: 'Vitest',
	cypress: 'Cypress',
	docker: 'Docker',
	zod: 'Zod',
	'@tanstack/vue-query': 'TanStack Query',
	'@tanstack/react-query': 'TanStack Query',
	axios: 'Axios',
	canvas: 'Canvas',
	fastapi: 'FastAPI',
	django: 'Django',
	flask: 'Flask',
	// Linguagens (como o GitHub as nomeia)
	typescript: 'TypeScript',
	javascript: 'JavaScript',
	python: 'Python',
	go: 'Golang',
	golang: 'Golang',
	lua: 'Lua',
	java: 'Java',
	'c#': 'C#',
	php: 'PHP',
	rust: 'Rust',
	kotlin: 'Kotlin',
	dart: 'Dart',
	flutter: 'Flutter',
}

// A linguagem "Vue"/"HTML"/"CSS" do GitHub vira o nome usado no currículo (HTML/CSS só se não houver framework)
const LANGUAGE_NAMES: Record<string, string> = { vue: 'Vue.js', html: 'HTML', css: 'CSS', scss: 'SASS' }

export const MAX_TECHNOLOGIES = 8

/** Tecnologias de um repositório, com nomes de exibição, a partir de topics, dependências e linguagens. */
export function repoTechnologies(repo: Pick<GithubRepo, 'topics' | 'dependencies' | 'languages' | 'language'>) {
	const names: string[] = []
	const add = (name: string | undefined) => {
		if (name && !names.includes(name)) names.push(name)
	}
	for (const topic of repo.topics) add(TECH_NAMES[topic.toLowerCase()])
	for (const dependency of repo.dependencies ?? []) add(TECH_NAMES[dependency.toLowerCase()])
	for (const language of repo.languages ?? (repo.language ? [repo.language] : [])) {
		const key = language.toLowerCase()
		add(TECH_NAMES[key] ?? LANGUAGE_NAMES[key])
	}
	return names
}
