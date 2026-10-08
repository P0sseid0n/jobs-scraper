import type { Page } from 'puppeteer'

import type { RawPost } from '@shared/contracts'
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

type ScrapeOptions = { config: ScraperConfig; queue: QueueClient; logger: Logger }

const RESULTS_TIMEOUT_MS = 30_000

/** Navegador da coleta em andamento, para ser fechado se o serviço for encerrado no meio. */
let activeSession: BrowserSession | undefined

export function closeActiveBrowser() {
	return activeSession?.close()
}

/** Uma coleta completa: abre a busca (logando se preciso) e envia os posts novos para a fila. */
export async function scrapeOnce(options: ScrapeOptions) {
	const { config, logger } = options

	const session = await BrowserSession.launch({
		headless: config.HEADLESS,
		noSandbox: config.BROWSER_NO_SANDBOX,
		cookieFile: config.LINKEDIN_COOKIES_FILE,
		fallbackLiAt: config.LINKEDIN_LI_AT,
		logger,
	})
	activeSession = session

	try {
		const page = await openSearchResults(session, options)
		const sent = await publishNewPosts(page, options)

		// Renova a sessão salva (o LinkedIn atualiza os cookies durante a navegação)
		await session.saveCookies()

		logger.info({ sent }, '✅ Coleta finalizada')
	} finally {
		activeSession = undefined
		await session.close()
	}
}

/** Abre a busca de posts, faz login se o LinkedIn pedir e espera os resultados aparecerem. */
async function openSearchResults(session: BrowserSession, { config, logger }: ScrapeOptions): Promise<Page> {
	const searchUrl = buildSearchUrl({ keywords: config.SEARCH_KEYWORDS, datePosted: config.SCRAPER_DATE_POSTED })
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

/** Rola a busca enviando cada post novo para a fila, até o limite por execução ou o fim dos resultados. */
async function publishNewPosts(page: Page, { config, queue, logger }: ScrapeOptions) {
	const seen = new Set<string>()
	let sent = 0
	let hasMore = true

	// Limite de posts por execução para reduzir o risco de bloqueio da conta no LinkedIn
	while (sent < config.SCRAPER_MAX_POSTS) {
		const posts = await collectNewPosts(page)
		logger.info({ found: posts.length, sent }, 'Posts novos nesta rolagem')

		for (const scraped of posts) {
			if (sent >= config.SCRAPER_MAX_POSTS) break

			const post = toRawPost(scraped)
			const textHash = hashPost(post.text)
			if (seen.has(post.postId) || seen.has(textHash)) continue

			seen.add(post.postId).add(textHash)
			await queue.publish(QUEUES.postProcessing, post)
			sent++

			logger.debug({ postId: post.postId, url: post.url }, '📨 Post enviado para a fila')
		}

		// Quando nada novo carregou, a coleta acima foi a última (pega posts que renderizaram depois)
		if (sent >= config.SCRAPER_MAX_POSTS || !hasMore) break

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
