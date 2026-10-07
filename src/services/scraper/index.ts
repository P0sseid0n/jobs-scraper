import path from 'node:path'
import type { Browser, BrowserContext, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import { linkedinEnv, loadConfig, rabbitmqEnv } from '../../config'
import type { RawPost } from '../../types/messages'
import * as FileUtils from '../../utils/files'
import { hashPost } from '../../utils/hash'
import { createLogger } from '../../utils/logger'
import { QUEUES, QueueClient } from '../../utils/queue'
import { onShutdown, setupGracefulShutdown, shutdown } from '../../utils/shutdown'

const logger = createLogger('scraper')
setupGracefulShutdown(logger)

const config = loadConfig({ ...rabbitmqEnv, ...linkedinEnv })

const SEARCH_FILTERS = {
	keywords: ['Front End', 'Vue'],
}

const BASE_URL = 'https://www.linkedin.com'

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function buildQueryString(filters: typeof SEARCH_FILTERS) {
	const params = new URLSearchParams()

	params.set('keywords', filters.keywords.join(' '))

	return `?${params.toString()}`
}

async function ensureLogin(browserManager: BrowserManager, waitUntilPath?: string) {
	const url = browserManager.page.url()
	logger.info({ url }, 'Verificando login')

	if (url.includes('/authwall')) {
		logger.info('🛡️ Bloqueado pelo authwall, navegando para a página de login')
		await browserManager.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
	}

	if (!url.includes('/login')) return

	logger.info('⚠️ Login necessário')

	await browserManager.page.type('#username', config.LINKEDIN_EMAIL)
	await browserManager.page.type('#password', config.LINKEDIN_PASSWORD)
	await browserManager.page.click('button[type="submit"]')

	if (waitUntilPath) {
		await browserManager.page.waitForFunction(() => window.location.href.includes(waitUntilPath), { timeout: 15000 })
	} else {
		await browserManager.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
	}

	const cookies = await browserManager.context!.cookies()
	const liAtCookie = cookies.find(cookie => cookie.name === 'li_at')
	browserManager.savePersistedCookies('li_at', liAtCookie?.value || '')

	logger.info('✅ Login realizado')
}

function scrapePage(page: Page, offset: number) {
	return page.evaluate((offset: number) => {
		const results: string[] = []
		// TODO: Testar porque as vezes volta poucas vagas
		// TODO: Pegar data de postagem
		Array.from(document.querySelectorAll('.update-components-text.relative.update-components-update-v2__commentary'))
			.slice(offset)
			.forEach(el => {
				let text = ''
				if (el instanceof HTMLDivElement) text = el.innerText || ''
				else text = el.textContent || ''

				results.push(text.replace(/\n/g, ''))
			})

		// TODO: Avaliar quanto deve ser feito o scroll
		window.scrollTo(0, document.body.scrollHeight)

		return results
	}, offset)
}

class BrowserManager {
	context!: BrowserContext
	page!: Page
	readonly LINKEDIN_COOKIE_FILE_NAME = 'linkedin_cookies.json'
	cookies: Record<string, string> = {}
	cookiesAppliedToBrowser = false

	private constructor(public browser: Browser) {}

	static async setupNewBrowser() {
		const launcher = await puppeteer.launch({
			headless: config.HEADLESS,
			args: config.BROWSER_NO_SANDBOX ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
		})
		const context = new BrowserManager(launcher)
		logger.info('🌐 Navegador iniciado')

		await context.loadPersistedCookies()
		await context.setupNewContextPage({ setCookies: true })

		return context
	}

	async setupNewContextPage(opts?: { setCookies?: true }) {
		logger.debug('🆕 Criando novo contexto e página')
		await this.context.close()

		this.context = await this.browser.createBrowserContext()
		this.page = await this.context.newPage()

		if (opts?.setCookies) {
			await this.applyPersistedCookiesToBrowser()
			this.cookiesAppliedToBrowser = true
		}

		return this.context
	}

	async applyPersistedCookiesToBrowser() {
		const loadedCookies = await FileUtils.loadJson(path.join(__dirname, './data', this.LINKEDIN_COOKIE_FILE_NAME))

		const cookies = {
			li_at: config.LINKEDIN_LI_AT || '',
			...loadedCookies,
		}

		Object.keys(cookies).forEach(async cookieName => {
			await this.context?.setCookie({
				name: cookieName,
				value: cookies[cookieName],
				domain: '.linkedin.com',
				path: '/',
			})
		})
	}

	async savePersistedCookies(cookieName: string, cookieValue: string) {
		this.cookies = {
			...this.cookies,
			[cookieName]: cookieValue,
		}

		await FileUtils.saveJson(path.join(__dirname, './data', this.LINKEDIN_COOKIE_FILE_NAME), this.cookies)
	}

	async loadPersistedCookies() {
		this.cookies = (await FileUtils.loadJson(path.join(__dirname, './data', this.LINKEDIN_COOKIE_FILE_NAME))) as Record<
			string,
			string
		>
		logger.debug('📥 Cookies persistidos carregados')
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

	const browserManager = await BrowserManager.setupNewBrowser()
	onShutdown(() => browserManager.browser.close())

	const SEARCH_PATH = '/search/results/all'
	const LOGIN_PATH = '/login'

	logger.info('🔎 Abrindo a busca do LinkedIn')
	await browserManager.page!.goto(BASE_URL + SEARCH_PATH + buildQueryString(SEARCH_FILTERS)).catch(async () => {
		logger.warn('🚫 Falha ao carregar a busca, criando nova página')

		await browserManager.setupNewContextPage()
		await browserManager.page!.goto(BASE_URL + LOGIN_PATH)
	})

	await ensureLogin(browserManager, '/feed/')

	if (!browserManager.page.url().includes(SEARCH_PATH)) {
		await browserManager.page!.goto(BASE_URL + SEARCH_PATH + buildQueryString(SEARCH_FILTERS))
	}

	await browserManager.page!.waitForSelector('li.search-results__search-feed-update')
	logger.info('🫡 Resultados carregados, iniciando coleta')

	let offset = 0
	let lastBatchSize = 1
	const sentPostIds = new Set<string>()

	// Limite de posts por execução para reduzir o risco de bloqueio da conta no LinkedIn
	while (lastBatchSize > 0 && sentPostIds.size < config.SCRAPER_MAX_POSTS) {
		const vagas = await scrapePage(browserManager.page!, offset)
		lastBatchSize = vagas.length
		offset += vagas.length

		logger.info({ found: vagas.length, total: offset }, 'Posts encontrados nesta rolagem')

		for (const vaga of vagas) {
			if (sentPostIds.size >= config.SCRAPER_MAX_POSTS) break

			const post: RawPost = { postId: hashPost(vaga), text: vaga, scrapedAt: new Date().toISOString() }
			if (!post.text.trim() || sentPostIds.has(post.postId)) continue

			await queue.publish(QUEUES.postProcessing, post)
			sentPostIds.add(post.postId)
			logger.debug({ postId: post.postId }, '📨 Post enviado para a fila')
		}

		const loadMoreBtn = await browserManager.page!.$(
			'button.artdeco-button.artdeco-button--muted.artdeco-button--1.artdeco-button--full.artdeco-button--secondary.ember-view.scaffold-finite-scroll__load-button',
		)

		if (loadMoreBtn) await loadMoreBtn.click()
		else logger.debug('Botão "carregar mais" não encontrado')

		await wait(config.SCRAPER_SCROLL_DELAY_MS)
	}

	logger.info({ sent: sentPostIds.size }, '✅ Coleta finalizada')
}

main()
	.then(() => shutdown(logger))
	.catch(error => {
		logger.fatal({ err: error }, 'Erro no scraper')
		return shutdown(logger, 1)
	})

// https://www.linkedin.com/jobs/search/?currentJobId=4275789186&f_TPR=r86400&f_WT=2&keywords=Front%20End%20NOT%20Estagio%20NOT%20Junior%20NOT%20Senior
