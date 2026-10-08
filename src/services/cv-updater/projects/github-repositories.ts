import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { Logger } from '@shared/logging'

import { GithubApi, RateLimited, type ListedRepo, type RepoDetails } from './github-api'

export { cleanReadme } from './github-api'

/** Repositório público com os dados usados para ranquear e descrever projetos no currículo. */
export type GithubRepo = ListedRepo & {
	[K in keyof RepoDetails]: RepoDetails[K] | null
} & {
	/** `pushedAt` de quando os detalhes foram buscados: se o repositório mudar, os detalhes são buscados de novo. */
	detailsPushedAt: string | null
}

type GithubOptions = {
	username: string
	token?: string
	exclude: string[]
	cacheDir: string
	cacheHours: number
	logger: Logger
}

type Cache = { username: string; fetchedAt: string; repos: GithubRepo[] }

/** Repositórios públicos do usuário, com cache em disco (renovado a cada `cacheHours`). */
export class GithubRepositories {
	private readonly api: GithubApi

	constructor(private readonly options: GithubOptions) {
		this.api = new GithubApi(options.token)
	}

	/**
	 * Devolve os repositórios com detalhes, usando o cache enquanto ele for válido.
	 * Ao renovar, só busca detalhes de quem mudou; o que o limite da API impedir fica para a próxima vez.
	 */
	async load(): Promise<GithubRepo[]> {
		const cache = await this.readCache()
		if (cache && this.isFresh(cache)) return cache.repos

		let listed: ListedRepo[]
		try {
			listed = await this.api.listRepos(this.options.username, this.options.exclude)
		} catch (error) {
			if (!cache) throw error

			this.options.logger.warn({ err: error }, 'Falha ao consultar o GitHub; usando o cache anterior')
			return cache.repos
		}

		const repos = await this.withDetails(listed, cache)
		await this.writeCache(repos)

		const detailed = repos.filter(repo => repo.languages !== null).length
		this.options.logger.info({ repos: repos.length, detailed }, 'Repositórios do GitHub atualizados')

		return repos
	}

	/** Reaproveita os detalhes em cache de quem não mudou e busca os demais enquanto a API permitir. */
	private async withDetails(listed: ListedRepo[], cache: Cache | null) {
		const previous = new Map(cache?.repos.map(repo => [repo.fullName, repo]))
		const repos: GithubRepo[] = []
		let rateLimited = false

		for (const item of listed) {
			const cached = previous.get(item.fullName)
			let repo: GithubRepo = cached?.detailsPushedAt === item.pushedAt ? { ...cached, ...item } : withoutDetails(item)

			// Detalhes custam 3 requisições: só para repositórios com descrição ou topics (sinal de dedicação)
			if (!rateLimited && repo.detailsPushedAt !== item.pushedAt && worthDetails(repo)) {
				try {
					repo = { ...repo, ...(await this.api.fetchDetails(repo.fullName)), detailsPushedAt: repo.pushedAt }
				} catch (error) {
					if (!(error instanceof RateLimited)) throw error

					rateLimited = true
					this.options.logger.warn(
						'Limite da API do GitHub atingido; o restante dos repositórios será detalhado depois (configure GITHUB_TOKEN)',
					)
				}
			}

			repos.push(repo)
		}

		return repos
	}

	/** Diz se o cache vale: até `cacheHours`, ou só 1 h se faltarem detalhes (o limite do GitHub renova a cada hora). */
	private isFresh(cache: Cache) {
		const ageHours = (Date.now() - new Date(cache.fetchedAt).getTime()) / 3_600_000
		const incomplete = cache.repos.some(repo => repo.detailsPushedAt !== repo.pushedAt && worthDetails(repo))

		return ageHours < this.options.cacheHours && (!incomplete || ageHours < 1)
	}

	private get cacheFile() {
		return path.join(this.options.cacheDir, `github-${this.options.username.toLowerCase()}.json`)
	}

	private async readCache(): Promise<Cache | null> {
		const file = Bun.file(this.cacheFile)
		if (!(await file.exists())) return null

		try {
			const cache = (await file.json()) as Cache
			return cache.username === this.options.username ? cache : null
		} catch {
			return null
		}
	}

	private async writeCache(repos: GithubRepo[]) {
		const cache: Cache = { username: this.options.username, fetchedAt: new Date().toISOString(), repos }

		await mkdir(this.options.cacheDir, { recursive: true })
		await Bun.write(this.cacheFile, JSON.stringify(cache))
	}
}

function withoutDetails(repo: ListedRepo): GithubRepo {
	return { ...repo, languages: null, dependencies: null, readme: null, detailsPushedAt: null }
}

function worthDetails(repo: Pick<GithubRepo, 'description' | 'topics'>) {
	return Boolean(repo.description) || repo.topics.length > 0
}
