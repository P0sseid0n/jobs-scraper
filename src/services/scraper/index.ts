import puppeteer from 'puppeteer-extra'
import { Browser, BrowserContext, Page } from 'puppeteer'
import { createQueue } from '../../utils/queue'
import * as FileUtils from '../../utils/files'
import path from 'path'

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

	return '?' + params.toString()
}

async function ensureLogin(browserManager: BrowserManager, waitUntilPath?: string) {
	const url = browserManager.page.url()
	console.log('Ensure login')

	console.log('Current URL:', url)

	if (url.includes('/authwall')) {
		console.log('🛡️ Blocked by authwall — navigating manually to login page...')
		await browserManager.page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
	}

	if (!url.includes('/login')) return

	console.log('⚠️ Login required...')

	const email = process.env.LINKEDIN_EMAIL
	const password = process.env.LINKEDIN_PASSWORD

	if (!email || !password) {
		throw new Error('LINKEDIN_EMAIL e LINKEDIN_PASSWORD são obrigatórios')
	}

	await browserManager.page.type('#username', email)
	await browserManager.page.type('#password', password)
	await browserManager.page.click('button[type="submit"]')

	if (waitUntilPath) {
		await browserManager.page.waitForFunction(() => window.location.href.includes(waitUntilPath), { timeout: 15000 })
	} else {
		await browserManager.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 })
	}

	const cookies = await browserManager.context!.cookies()
	const liAtCookie = cookies.find(cookie => cookie.name === 'li_at')
	browserManager.savePersistedCookies('li_at', liAtCookie?.value || '')

	console.log('✅ Login successful')
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
		const launcher = await puppeteer.launch({ headless: false })
		const context = new BrowserManager(launcher)
		console.log('🌐 Browser launched')

		await context.loadPersistedCookies()
		await context.setupNewContextPage({ setCookies: true })

		return context
	}

	async setupNewContextPage(opts?: { setCookies?: true }) {
		console.log('🆕 Setting up new browser context and page...')
		await this.context.close()

		this.context = await this.browser.createBrowserContext()
		this.page = await this.context.newPage()

		if (opts?.setCookies) {
			await this.applyPersistedCookiesToBrowser()
			this.cookiesAppliedToBrowser = true
		}

		console.log('🆕 Setting up new browser context and page... OK')

		return this.context
	}

	async applyPersistedCookiesToBrowser() {
		const loadedCookies = await FileUtils.loadJson(path.join(__dirname, './data', this.LINKEDIN_COOKIE_FILE_NAME))

		const cookies = {
			li_at: process.env.LINKEDIN_LI_AT || '',
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
		console.log('📥 Loading persisted cookies...')
		this.cookies = (await FileUtils.loadJson(path.join(__dirname, './data', this.LINKEDIN_COOKIE_FILE_NAME))) as Record<
			string,
			string
		>
		console.log('📥 Loading persisted cookies... OK')
	}
}

async function main() {
	console.log('🚀 Starting scraper...')

	const QUEUE = 'post_processing'
	const { channel } = await createQueue(QUEUE)
	console.log('📬 Queue created:', QUEUE)
	const browserManager = await BrowserManager.setupNewBrowser()

	const SEARCH_PATH = '/search/results/all'
	const LOGIN_PATH = '/login'

	console.log('🔎 Navigating to LinkedIn search page...')
	await browserManager.page!.goto(BASE_URL + SEARCH_PATH + buildQueryString(SEARCH_FILTERS)).catch(async () => {
		console.log('🚫 Failed to load search page, creating new page...')

		await browserManager.setupNewContextPage()
		await browserManager.page!.goto(BASE_URL + LOGIN_PATH)
	})

	await ensureLogin(browserManager, '/feed/')

	if (!browserManager.page.url().includes(SEARCH_PATH)) {
		await browserManager.page!.goto(BASE_URL + SEARCH_PATH + buildQueryString(SEARCH_FILTERS))
	}

	await browserManager.page!.waitForSelector('li.search-results__search-feed-update')
	console.log('🫡 Search results loaded, starting to scrape...')

	let offset = 0
	let lastBatchSize = 1

	while (lastBatchSize > 0) {
		console.log(`Scrolling... Attempt ${offset}`)

		const vagas = await scrapePage(browserManager.page!, offset)
		lastBatchSize = vagas.length
		offset += vagas.length

		console.log(`Found ${vagas.length} vagas in this scroll, total: ${offset}`)

		vagas.forEach(vaga => {
			console.log('📨 Sending vaga to queue:', vaga)
			channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(vaga)))
		})

		const loadMoreBtn = await browserManager.page!.$(
			'button.artdeco-button.artdeco-button--muted.artdeco-button--1.artdeco-button--full.artdeco-button--secondary.ember-view.scaffold-finite-scroll__load-button'
		)

		if (loadMoreBtn) await loadMoreBtn.click()
		else console.log('No load more button found')

		await wait(10_000)
	}

	await browserManager.browser.close()
}

main()

// https://www.linkedin.com/jobs/search/?currentJobId=4275789186&f_TPR=r86400&f_WT=2&keywords=Front%20End%20NOT%20Estagio%20NOT%20Junior%20NOT%20Senior
