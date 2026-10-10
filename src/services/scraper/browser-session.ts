import type { Browser, BrowserContext, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

import type { Logger } from '@shared/logging'

import { loadJson, saveJson } from './json-file'
import { linkedinCookie, parseStoredCookies } from './linkedin/session-cookies'

puppeteer.use(StealthPlugin())

type BrowserOptions = {
	headless: boolean
	noSandbox: boolean

	/** Onde a sessão do LinkedIn (cookies) é salva entre execuções. */
	cookieFile: string

	/** Cookie `li_at` vindo do .env, usado quando o arquivo de cookies ainda não tem um. */
	fallbackLiAt?: string

	logger: Logger
}

const NAVIGATION_ATTEMPTS = 3

/** Navegador com uma aba anônima e a sessão do LinkedIn salva em disco. */
export class BrowserSession {
	context?: BrowserContext
	private currentPage?: Page

	private constructor(
		private browser: Browser,
		private readonly options: BrowserOptions,
	) {}

	static async launch(options: BrowserOptions) {
		// Cópia: `relaunch` altera o `headless`
		const session = new BrowserSession(await launchBrowser(options), { ...options })
		await session.newContext()

		return session
	}

	/** Se o navegador está sem janela. */
	get headless() {
		return this.options.headless
	}

	/**
	 * Fecha o navegador e abre outro, com ou sem janela (não dá para mostrar a janela de um navegador headless já aberto).
	 * Com `withCookies`, restaura a sessão salva em disco.
	 */
	async relaunch({ headless, withCookies = true }: { headless: boolean; withCookies?: boolean }) {
		await this.browser.close()

		this.options.headless = headless
		this.context = undefined
		this.browser = await launchBrowser(this.options)

		await this.newContext({ withCookies })
	}

	get page(): Page {
		if (!this.currentPage) throw new Error('Nenhuma página aberta')

		return this.currentPage
	}

	/** Abre um contexto limpo (aba anônima); com `withCookies`, restaura a sessão salva. */
	async newContext({ withCookies = true } = {}) {
		await this.context?.close()

		this.context = await this.browser.createBrowserContext()
		this.currentPage = await this.context.newPage()

		if (withCookies) await this.restoreCookies()
	}

	/** Navega para `url`, tentando de novo se a navegação for abortada (ex.: redirecionamento em andamento). */
	async goto(url: string) {
		for (let attempt = 1; ; attempt++) {
			try {
				return await this.page.goto(url, { waitUntil: 'domcontentloaded' })
			} catch (error) {
				if (attempt >= NAVIGATION_ATTEMPTS || !String(error).includes('ERR_ABORTED')) throw error

				this.options.logger.debug({ attempt }, 'Navegação abortada, tentando de novo')
				await Bun.sleep(2_000)
			}
		}
	}

	/** Diz se o contexto atual tem uma sessão do LinkedIn (cookie `li_at` com valor). */
	async hasSession() {
		const cookies = (await this.context?.cookies()) ?? []

		return cookies.some(cookie => cookie.name === 'li_at' && cookie.value)
	}

	/** Salva todos os cookies do LinkedIn da sessão atual, se ela for válida. */
	async saveCookies() {
		if (!this.context) return

		const cookies = (await this.context.cookies()).filter(cookie => cookie.domain.endsWith('linkedin.com') && cookie.value)

		if (!cookies.some(cookie => cookie.name === 'li_at')) {
			this.options.logger.warn('Cookie li_at não encontrado após o login; a sessão não foi salva')
			return
		}

		await saveJson(this.options.cookieFile, cookies)
		this.options.logger.debug({ count: cookies.length }, '💾 Cookies salvos')
	}

	/** Salva um screenshot da página atual (ex.: para ver qual verificação o LinkedIn pediu). */
	async saveScreenshot(filePath: string) {
		await Bun.write(filePath, await this.page.screenshot({ type: 'png' }))
	}

	close() {
		return this.browser.close()
	}

	private async restoreCookies() {
		const cookies = parseStoredCookies(await loadJson(this.options.cookieFile, []))

		if (this.options.fallbackLiAt && !cookies.some(cookie => cookie.name === 'li_at')) {
			cookies.push(linkedinCookie('li_at', this.options.fallbackLiAt))
		}

		if (cookies.length > 0) await this.context?.setCookie(...cookies)
		this.options.logger.debug({ count: cookies.length }, '📥 Cookies restaurados')
	}
}

async function launchBrowser(options: BrowserOptions) {
	const browser = await puppeteer.launch({
		headless: options.headless,
		args: options.noSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
	})
	options.logger.info({ headless: options.headless }, '🌐 Navegador iniciado')

	return browser
}
