/** Chamadas à API REST do GitHub, controlando o limite de requisições (60/hora sem token). */

/** Repositório como vem na listagem (sem os detalhes, que custam requisições extras). */
export type ListedRepo = {
	name: string
	fullName: string
	url: string
	description: string | null
	topics: string[]

	/** Linguagem principal (vem na listagem; usada enquanto os detalhes não foram buscados). */
	language: string | null

	pushedAt: string
	stars: number
}

export type RepoDetails = {
	/** Linguagens com pelo menos 10% do código. */
	languages: string[]

	/** Dependências do package.json da raiz (vazio se não houver). */
	dependencies: string[]

	/** Começo do README, sem imagens/badges. */
	readme: string
}

type RawRepo = {
	name: string
	full_name: string
	html_url: string
	description: string | null
	topics?: string[]
	language: string | null
	pushed_at: string
	stargazers_count: number
	fork: boolean
	archived: boolean
}

const API = 'https://api.github.com'
const README_MAX = 1500
const MIN_LANGUAGE_SHARE = 0.1

// Sem token a API permite 60 requisições/hora: guardamos uma margem para não ficar sem nenhuma
const RATE_LIMIT_RESERVE = 5

export class RateLimited extends Error {}

export class GithubApi {
	private remaining = Number.POSITIVE_INFINITY

	constructor(private readonly token?: string) {}

	/** Repositórios do usuário, sem forks, arquivados, o repositório de perfil e os nomes em `exclude`. */
	async listRepos(username: string, exclude: string[]): Promise<ListedRepo[]> {
		const excluded = new Set([username, ...exclude].map(name => name.toLowerCase()))
		const repos: ListedRepo[] = []

		for (let page = 1; page <= 10; page++) {
			const response = await this.request(
				`${API}/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=pushed&page=${page}`,
			)
			if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao listar os repositórios`)

			const batch = (await response.json()) as RawRepo[]

			for (const repo of batch) {
				if (repo.fork || repo.archived || excluded.has(repo.name.toLowerCase())) continue
				repos.push(toListedRepo(repo))
			}

			if (batch.length < 100) break
		}

		return repos
	}

	/** Linguagens, dependências e README (3 requisições). */
	async fetchDetails(fullName: string): Promise<RepoDetails> {
		const base = `${API}/repos/${fullName}`

		return {
			languages: await this.fetchLanguages(base),
			dependencies: await this.fetchDependencies(base),
			readme: await this.fetchReadme(base),
		}
	}

	private async fetchLanguages(base: string) {
		const response = await this.request(`${base}/languages`)
		const bytes = response.ok ? ((await response.json()) as Record<string, number>) : {}
		const total = Object.values(bytes).reduce((sum, value) => sum + value, 0)

		return Object.entries(bytes)
			.filter(([, value]) => total > 0 && value / total >= MIN_LANGUAGE_SHARE)
			.sort(([, a], [, b]) => b - a)
			.map(([language]) => language)
	}

	private async fetchDependencies(base: string) {
		const response = await this.request(`${base}/contents/package.json`, 'application/vnd.github.raw')
		if (!response.ok) return []

		try {
			const pkg = (await response.json()) as Record<string, Record<string, string> | undefined>
			return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
		} catch {
			// package.json inválido: segue sem dependências
			return []
		}
	}

	private async fetchReadme(base: string) {
		const response = await this.request(`${base}/readme`, 'application/vnd.github.raw')

		return response.ok ? cleanReadme(await response.text()) : ''
	}

	private async request(url: string, accept = 'application/vnd.github+json') {
		if (this.remaining <= RATE_LIMIT_RESERVE) throw new RateLimited()

		const response = await fetch(url, {
			headers: {
				Accept: accept,
				'User-Agent': 'jobs-scraper-cv-updater',
				'X-GitHub-Api-Version': '2022-11-28',
				...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
			},
		})

		const remaining = Number(response.headers.get('x-ratelimit-remaining'))
		if (!Number.isNaN(remaining)) this.remaining = remaining

		const limited = response.status === 403 || response.status === 429
		if (limited && this.remaining <= RATE_LIMIT_RESERVE) throw new RateLimited()

		return response
	}
}

/** Remove imagens, badges, HTML e links do README, deixando só texto. */
export function cleanReadme(markdown: string) {
	return markdown
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/```[\s\S]*?```/g, '')
		.replace(/[#>*_`|]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, README_MAX)
}

function toListedRepo(repo: RawRepo): ListedRepo {
	return {
		name: repo.name,
		fullName: repo.full_name,
		url: repo.html_url,
		description: repo.description?.trim() || null,
		topics: repo.topics ?? [],
		language: repo.language,
		pushedAt: repo.pushed_at,
		stars: repo.stargazers_count,
	}
}
