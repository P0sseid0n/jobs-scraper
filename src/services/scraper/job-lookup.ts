import type { Page } from 'puppeteer'

import type { JobLookup } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import type { BrowserLock } from './browser-lock'
import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { lookupToRawPost, type ListingPage } from './job-lookup-post'
import { SELECTORS } from './linkedin/selectors'
import { canonicalJobUrl, isLinkedInUrl, safetyRedirectTarget } from './linkedin/urls'
import { ensureLoggedIn, loginOptionsFrom } from './login'

type LookupOptions = { config: ScraperConfig; queue: QueueClient; logger: Logger; lock: BrowserLock }

/** Sem vagas novas por esse tempo, o navegador das vagas é fechado. */
const IDLE_CLOSE_MS = 60_000
const JOB_PAGE_TIMEOUT_MS = 15_000
/** Links de agregadores passam por vários redirecionamentos (anúncios, rastreio): espera a URL parar de mudar. */
const REDIRECT_SETTLE_MS = 5_000
const REDIRECT_TIMEOUT_MS = 30_000

/**
 * Abre o link de cada vaga de um post com várias (fila `scraper-lookup`), como uma busca: uma por vez, no navegador
 * logado, com pausa depois de cada uma e nunca durante uma coleta. O texto da página vai para o post-processing.
 */
export class JobLookupWorker {
	private session?: BrowserSession
	private idleTimer?: ReturnType<typeof setTimeout>

	constructor(private readonly options: LookupOptions) {}

	handle(lookup: JobLookup) {
		return this.options.lock.run(async () => {
			clearTimeout(this.idleTimer)
			const log = this.options.logger.child({ postId: lookup.postId, link: lookup.link })

			const page = await this.readListing(lookup, log)
			await this.options.queue.publish(QUEUES.postProcessing, lookupToRawPost(lookup, page))
			log.info({ title: lookup.title, opened: page !== null }, '🔗 Vaga do post com várias enviada para o post-processing')

			// A pausa fica dentro da trava: a próxima vaga (ou coleta) só acessa o LinkedIn depois dela
			const delay = this.options.config.SCRAPER_LOOKUP_DELAY_MS
			await Bun.sleep(delay + Math.random() * delay)

			this.idleTimer = setTimeout(() => {
				this.options.lock.run(() => this.close()).catch(() => {})
			}, IDLE_CLOSE_MS)
		})
	}

	/** Fecha o navegador das vagas (a coleta abre o próprio; os dois nunca ficam abertos ao mesmo tempo). */
	async close() {
		clearTimeout(this.idleTimer)

		const session = this.session
		this.session = undefined
		await session?.close()
	}

	/**
	 * Abre o link (seguindo o aviso de link externo do LinkedIn) e lê a vaga.
	 * @returns `null` se a página não abrir: a vaga segue só com o texto do post, sem tentar de novo no LinkedIn.
	 */
	private async readListing(lookup: JobLookup, log: Logger): Promise<ListingPage | null> {
		try {
			const session = await this.openSession()
			await session.goto(lookup.link)

			// A sessão e o login só valem no LinkedIn: um site de fora com /login não é o login do LinkedIn
			if (isLinkedInUrl(session.page.url())) {
				const loggedInNow = await ensureLoggedIn(session, loginOptionsFrom(this.options.config, log))
				if (loggedInNow) await session.goto(lookup.link)
			}

			const target = await externalTarget(session.page)
			if (target) await session.goto(target)

			return await readJobPage(session.page)
		} catch (error) {
			log.warn({ err: error }, 'Não foi possível abrir a vaga; ela segue só com o texto do post')

			// Navegador num estado desconhecido (ex.: login pela metade): a próxima vaga abre outro
			await this.close().catch(() => {})
			return null
		}
	}

	private async openSession() {
		this.session ??= await BrowserSession.launch(browserOptionsFrom(this.options.config, this.options.logger))

		return this.session
	}
}

/** O destino quando o link parou no aviso de site externo (lnkd.in ou /safety/go), ou `null`. */
async function externalTarget(page: Page) {
	const url = page.url()
	if (new URL(url).hostname === 'lnkd.in') {
		return page.$eval(SELECTORS.shortLinkTarget, link => (link as HTMLAnchorElement).href).catch(() => null)
	}

	return safetyRedirectTarget(url)
}

/** Lê o topo e a descrição de uma vaga do LinkedIn; em outro site (ou se o layout mudar), o `<main>` ou a página toda. */
async function readJobPage(page: Page): Promise<ListingPage> {
	if (canonicalJobUrl(page.url())) {
		await page.waitForSelector(SELECTORS.jobDescription, { timeout: JOB_PAGE_TIMEOUT_MS }).catch(() => {})
	} else {
		await waitForRedirects(page)
	}

	const text = await page.evaluate(
		selectors => {
			const parts = [selectors.jobTopCard, selectors.jobDescription]
				.map(selector => document.querySelector<HTMLElement>(selector)?.innerText.trim() ?? '')
				.filter(Boolean)

			return parts.length > 0
				? parts.join('\n\n')
				: ((document.querySelector<HTMLElement>('main') ?? document.body)?.innerText ?? '')
		},
		{ jobTopCard: SELECTORS.jobTopCard, jobDescription: SELECTORS.jobDescription },
	)

	return { url: page.url(), text }
}

/** Espera a URL ficar parada por um tempo (fim dos redirecionamentos e da renderização no cliente), até um limite. */
async function waitForRedirects(page: Page) {
	const deadline = Date.now() + REDIRECT_TIMEOUT_MS
	let url = page.url()

	while (Date.now() < deadline) {
		await Bun.sleep(REDIRECT_SETTLE_MS)

		const current = page.url()
		if (current === url) return
		url = current
	}
}
