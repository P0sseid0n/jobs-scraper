import path from 'node:path'
import { linkedinEnv, loadConfig, rabbitmqEnv } from '../../config'
import type { RawPost } from '../../types/messages'
import { hashPost } from '../../utils/hash'
import { createLogger } from '../../utils/logger'
import { QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown, shutdown } from '../../utils/shutdown'
import { ensureLoggedIn } from './auth'
import { BrowserManager } from './browser'
import { buildSearchUrl, cleanPostText, LOGIN_URL, postedAtFromUrn, postUrlFromUrn, resolvePostUrn, SELECTORS } from './linkedin'
import { collectNewPosts, loadMorePosts, type ScrapedPost } from './scrape'

const logger = createLogger('scraper')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...linkedinEnv })

const COOKIE_FILE = path.join(import.meta.dir, 'data', 'linkedin_cookies.json')
const RESULTS_TIMEOUT_MS = 30_000

/** Pausa aleatória entre rolagens para não ter um ritmo de robô. */
function humanPause() {
	return Bun.sleep(1_500 + Math.random() * 2_500)
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

/** Navega tentando de novo se a navegação for abortada (ex.: por um redirecionamento ainda em andamento). */
async function gotoWithRetry(browser: BrowserManager, url: string, attempts = 3) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await browser.page.goto(url, { waitUntil: 'domcontentloaded' })
		} catch (error) {
			if (attempt >= attempts || !String(error).includes('ERR_ABORTED')) throw error
			logger.debug({ attempt }, 'Navegação abortada, tentando de novo')
			await Bun.sleep(2_000)
		}
	}
}

let activeBrowser: BrowserManager | undefined
onShutdown(() => activeBrowser?.close())

async function scrapeOnce(queue: QueueClient) {
	const browser = await BrowserManager.launch({
		headless: config.HEADLESS,
		noSandbox: config.BROWSER_NO_SANDBOX,
		cookieFile: COOKIE_FILE,
		fallbackLiAt: config.LINKEDIN_LI_AT,
		logger,
	})
	activeBrowser = browser

	try {
		const searchUrl = buildSearchUrl({ keywords: config.SEARCH_KEYWORDS, datePosted: config.SCRAPER_DATE_POSTED })
		const loginOptions = {
			email: config.LINKEDIN_EMAIL,
			password: config.LINKEDIN_PASSWORD,
			headless: config.HEADLESS,
			logger,
		}

		logger.info({ searchUrl }, '🔎 Abrindo a busca do LinkedIn')
		try {
			await browser.page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
		} catch (error) {
			// Cookies inválidos podem causar loop de redirecionamento: recomeça sem eles e faz login
			logger.warn({ err: error }, '🚫 Falha ao carregar a busca, tentando de novo sem os cookies salvos')
			await browser.newContext({ withCookies: false })
			await browser.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
		}

		if (await ensureLoggedIn(browser, loginOptions)) {
			await gotoWithRetry(browser, searchUrl)
		}

		const page = browser.page
		try {
			await page.waitForSelector(`${SELECTORS.post}, ${SELECTORS.postText}`, { timeout: RESULTS_TIMEOUT_MS })
		} catch (error) {
			throw new Error(
				`Nenhum post encontrado em ${page.url()}. A busca pode estar vazia ou os seletores em src/services/scraper/linkedin.ts estão desatualizados.`,
				{ cause: error },
			)
		}
		logger.info('🫡 Resultados carregados, iniciando coleta')

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

		// Renova a sessão salva (o LinkedIn atualiza os cookies durante a navegação)
		await browser.saveCookies()
		logger.info({ sent }, '✅ Coleta finalizada')
	} finally {
		activeBrowser = undefined
		await browser.close()
	}
}

async function main() {
	logger.info('🚀 Iniciando scraper')

	const queue = new QueueClient({
		url: config.RABBITMQ_URL,
		maxRetries: config.QUEUE_MAX_RETRIES,
		retryDelayMs: config.QUEUE_RETRY_DELAY_MS,
		logger,
	})
	await queue.connect()
	onShutdown(() => queue.close())
	await queue.assertQueue(QUEUES.postProcessing)

	if (config.SCRAPER_INTERVAL_MINUTES === 0) {
		await scrapeOnce(queue)
		return
	}

	const intervalMs = config.SCRAPER_INTERVAL_MINUTES * 60_000
	while (true) {
		try {
			await scrapeOnce(queue)
		} catch (error) {
			logger.error({ err: error }, 'Erro na coleta; tentando de novo no próximo ciclo')
		}
		logger.info({ minutes: config.SCRAPER_INTERVAL_MINUTES }, '⏰ Próxima coleta agendada')
		await Bun.sleep(intervalMs)
	}
}

main()
	.then(() => shutdown(logger))
	.catch(error => {
		logger.fatal({ err: error }, 'Erro no scraper')
		return shutdown(logger, 1)
	})
