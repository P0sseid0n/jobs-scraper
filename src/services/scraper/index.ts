import puppeteer from 'puppeteer-extra'
import { Browser, BrowserContext, Page } from 'puppeteer'
import { createQueue } from '../../utils/queue.js'

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

async function ensureLogin(page: Page, searchPath: string) {
	const url = page.url()

	console.log('Current URL:', url)

	if (url.includes('/authwall')) {
		console.log('🛡️ Blocked by authwall — navigating manually to login page...')
		await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })
	}

	if (!url.includes('/login')) return

	console.log('⚠️ Login required...')

	const email = process.env.LINKEDIN_EMAIL
	const password = process.env.LINKEDIN_PASSWORD

	if (!email || !password) {
		throw new Error('LINKEDIN_EMAIL e LINKEDIN_PASSWORD são obrigatórios')
	}

	await page.type('#username', email)
	await page.type('#password', password)
	await page.click('button[type="submit"]')

	while (!page.url().includes(searchPath)) {
		await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 3000 }).catch(() => {})
		// await page.waitForURL('**' + searchPath, { timeout: 5000 })
	}

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
	private constructor(public browser: Browser) {}

	static async setupNewBrowser() {
		const launcher = await puppeteer.launch({ headless: false })

		const context = new BrowserManager(launcher)
		await context.setupNewContextPage()

		return context
	}

	async setupNewContextPage(opts?: { setLinkedInCookies?: boolean }) {
		this.context = await this.browser.createBrowserContext()
		this.page = await this.context.newPage()

		if (opts?.setLinkedInCookies) {
			await this.applyLinkedInCookies()
		}

		return this.context
	}

	async applyLinkedInCookies() {
		if (!process.env.LINKEDIN_LI_AT) return

		await this.context?.setCookie({
			name: 'li_at',
			value: process.env.LINKEDIN_LI_AT,
			domain: '.linkedin.com',
			path: '/',
		})
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

		browserManager.setupNewContextPage()
		browserManager.page!.goto(BASE_URL + LOGIN_PATH)
	})

	console.log(`url: ${browserManager.page!.url()}`)

	await ensureLogin(browserManager.page!, SEARCH_PATH)

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
			console.log('Sending vaga to queue:', vaga)
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
