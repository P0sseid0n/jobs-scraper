import type { Page } from 'puppeteer'

import type { RawPost, ScraperSettings } from '@shared/contracts'
import type { ScraperRunTerm } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { collectNewPosts, loadMorePosts, type ScrapedPost } from './feed-reader'
import { cleanPostText } from './linkedin/post-text'
import { postedAtFromUrn, postUrlFromUrn, resolvePostUrn } from './linkedin/post-urn'
import { SELECTORS } from './linkedin/selectors'
import { buildSearchUrl, LOGIN_URL } from './linkedin/urls'
import { ensureLoggedIn } from './login'
import { hashPost } from './post-id'
import { postsPerTerm } from './schedule'

type ScrapeOptions = { config: ScraperConfig; settings: ScraperSettings; queue: QueueClient; logger: Logger }

const RESULTS_TIMEOUT_MS = 30_000

/** Navegador da coleta em andamento, para ser fechado se o serviço for encerrado no meio. */
let activeSession: BrowserSession | undefined

export function closeActiveBrowser() {
	return activeSession?.close()
}

/**
 * Faz uma coleta: busca cada termo ativo em sequência e envia os posts novos para a fila.
 * @returns O resultado de cada termo; um termo que falhar não impede os outros.
 */
export async function scrapeOnce(options: ScrapeOptions): Promise<ScraperRunTerm[]> {
	const { config, settings, logger } = options

	const terms = settings.searchTerms.filter(term => term.enabled).map(term => term.term)
	const limit = postsPerTerm(settings.maxPostsPerRun, terms.length)

	// Compartilhado entre os termos: um post que aparece em duas buscas só é enviado uma vez
	const seen = new Set<string>()

	const session = await BrowserSession.launch({
		headless: config.HEADLESS,
		noSandbox: config.BROWSER_NO_SANDBOX,
		cookieFile: config.LINKEDIN_COOKIES_FILE,
		fallbackLiAt: config.LINKEDIN_LI_AT,
		logger,
	})
	activeSession = session

	try {
		const results: ScraperRunTerm[] = []

		for (const [index, term] of terms.entries()) {
			if (index > 0) await humanPause()
			results.push(await scrapeTerm(session, { term, limit, seen }, options))
		}

		// Renova a sessão salva (o LinkedIn atualiza os cookies durante a navegação)
		await session.saveCookies()

		const sent = results.reduce((total, result) => total + result.sent, 0)
		logger.info({ sent, terms: results.length }, '✅ Coleta finalizada')

		return results
	} finally {
		activeSession = undefined
		await session.close()
	}
}

type TermSearch = { term: string; limit: number; seen: Set<string> }

async function scrapeTerm(session: BrowserSession, search: TermSearch, options: ScrapeOptions): Promise<ScraperRunTerm> {
	const logger = options.logger.child({ term: search.term })

	try {
		const page = await openSearchResults(session, search.term, { ...options, logger })
		const sent = await publishNewPosts(page, search, { ...options, logger })

		return { term: search.term, sent, error: null }
	} catch (error) {
		logger.error({ err: error }, 'Falha na busca deste termo')

		return { term: search.term, sent: 0, error: error instanceof Error ? error.message : String(error) }
	}
}

/** Abre a busca de posts, faz login se o LinkedIn pedir e espera os resultados aparecerem. */
async function openSearchResults(session: BrowserSession, term: string, { config, settings, logger }: ScrapeOptions): Promise<Page> {
	const searchUrl = buildSearchUrl({ keywords: term, datePosted: settings.datePosted })
	logger.info({ searchUrl }, '🔎 Abrindo a busca do LinkedIn')

	try {
		await session.page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
	} catch (error) {
		// Cookies inválidos podem causar loop de redirecionamento: recomeça sem eles e faz login
		logger.warn({ err: error }, '🚫 Falha ao carregar a busca, tentando de novo sem os cookies salvos')
		await session.newContext({ withCookies: false })
		await session.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
	}

	const loggedInNow = await ensureLoggedIn(session, {
		email: config.LINKEDIN_EMAIL,
		password: config.LINKEDIN_PASSWORD,
		headless: config.HEADLESS,
		logger,
	})
	if (loggedInNow) await session.goto(searchUrl)

	const page = session.page

	try {
		await page.waitForSelector(`${SELECTORS.post}, ${SELECTORS.postText}`, { timeout: RESULTS_TIMEOUT_MS })
	} catch (error) {
		throw new Error(
			`Nenhum post encontrado em ${page.url()}. A busca pode estar vazia ou os seletores em src/services/scraper/linkedin/selectors.ts estão desatualizados.`,
			{ cause: error },
		)
	}

	logger.info('🫡 Resultados carregados, iniciando coleta')
	return page
}

/** Rola a busca enviando cada post novo para a fila, até o limite do termo ou o fim dos resultados. */
async function publishNewPosts(page: Page, { limit, seen }: TermSearch, { config, queue, logger }: ScrapeOptions) {
	let sent = 0
	let hasMore = true

	// Limite de posts por coleta (dividido entre os termos) para reduzir o risco de bloqueio da conta
	while (sent < limit) {
		const posts = await collectNewPosts(page)
		logger.info({ found: posts.length, sent }, 'Posts novos nesta rolagem')

		for (const scraped of posts) {
			if (sent >= limit) break

			const post = toRawPost(scraped)
			const textHash = hashPost(post.text)
			if (seen.has(post.postId) || seen.has(textHash)) continue

			seen.add(post.postId).add(textHash)
			await queue.publish(QUEUES.postProcessing, post)
			sent++

			logger.debug({ postId: post.postId, url: post.url }, '📨 Post enviado para a fila')
		}

		// Quando nada novo carregou, a coleta acima foi a última (pega posts que renderizaram depois)
		if (sent >= limit || !hasMore) break

		await humanPause()
		hasMore = await loadMorePosts(page, config.SCRAPER_SCROLL_DELAY_MS)
	}

	return sent
}

function toRawPost(post: ScrapedPost): RawPost {
	const text = cleanPostText(post.text)
	const urn = resolvePostUrn(post.urnCandidates)

	return {
		postId: urn ?? hashPost(text),
		text,
		url: urn ? postUrlFromUrn(urn) : null,
		author: post.author,
		postedAt: urn ? postedAtFromUrn(urn) : null,
		scrapedAt: new Date().toISOString(),
	}
}

/** Pausa aleatória entre rolagens para não ter um ritmo de robô. */
function humanPause() {
	return Bun.sleep(1_500 + Math.random() * 2_500)
}
