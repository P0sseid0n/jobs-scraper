import type { Browser, BrowserContext, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import * as FileUtils from '../../utils/files'
import type { Logger } from '../../utils/logger'
import { linkedinCookie, parseStoredCookies } from './linkedin'

puppeteer.use(StealthPlugin())

type BrowserOptions = {
	headless: boolean
	noSandbox: boolean
	cookieFile: string
	/** Cookie `li_at` vindo do .env, usado quando o arquivo de cookies ainda não tem um. */
	fallbackLiAt?: string
	logger: Logger
}

export class BrowserManager {
	context?: BrowserContext
	private currentPage?: Page

	private constructor(
		readonly browser: Browser,
		private readonly opts: BrowserOptions,
	) {}

	static async launch(opts: BrowserOptions) {
		const browser = await puppeteer.launch({
			headless: opts.headless,
			args: opts.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
		})
		opts.logger.info('🌐 Navegador iniciado')

		const manager = new BrowserManager(browser, opts)
		await manager.newContext()
		return manager
	}

	get page(): Page {
		if (!this.currentPage) throw new Error('Nenhuma página aberta')
		return this.currentPage
	}

	/** Abre um contexto limpo (aba anônima). Com `withCookies`, restaura a sessão salva. */
	async newContext({ withCookies = true } = {}) {
		await this.context?.close()

		this.context = await this.browser.createBrowserContext()
		this.currentPage = await this.context.newPage()

		if (withCookies) await this.restoreCookies()
	}

	private async restoreCookies() {
		const stored = await FileUtils.loadJson(this.opts.cookieFile, [])
		const cookies = parseStoredCookies(stored)

		if (this.opts.fallbackLiAt && !cookies.some(cookie => cookie.name === 'li_at')) {
			cookies.push(linkedinCookie('li_at', this.opts.fallbackLiAt))
		}

		if (cookies.length > 0) await this.context?.setCookie(...cookies)
		this.opts.logger.debug({ count: cookies.length }, '📥 Cookies restaurados')
	}

	/** Há uma sessão do LinkedIn (cookie `li_at` com valor) no contexto atual? */
	async hasSession() {
		const cookies = (await this.context?.cookies()) ?? []
		return cookies.some(cookie => cookie.name === 'li_at' && cookie.value)
	}

	/** Salva todos os cookies do LinkedIn da sessão atual (não só o `li_at`), se houver uma sessão válida. */
	async saveCookies() {
		if (!this.context) return

		const cookies = (await this.context.cookies()).filter(cookie => cookie.domain.endsWith('linkedin.com') && cookie.value)
		if (!cookies.some(cookie => cookie.name === 'li_at')) {
			this.opts.logger.warn('Cookie li_at não encontrado após o login; a sessão não foi salva')
			return
		}

		await FileUtils.saveJson(this.opts.cookieFile, cookies)
		this.opts.logger.debug({ count: cookies.length }, '💾 Cookies salvos')
	}

	close() {
		return this.browser.close()
	}
}
