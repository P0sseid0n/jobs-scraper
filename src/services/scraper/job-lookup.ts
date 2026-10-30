import type { Page } from 'puppeteer'

import type { JobLookup, JobReprocessResult, PostReread, RawPost } from '@shared/contracts'
import { SeenPost } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials } from '@shared/settings'

import type { BrowserLock } from './browser-lock'
import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { collectNewPosts } from './feed-reader'
import { listingPageText, lookupToRawPost, type ListingPage } from './job-lookup-post'
import { postImageUrls } from './linkedin/post-images'
import { cleanPostText } from './linkedin/post-text'
import { resolvePostUrn } from './linkedin/post-urn'
import { SELECTORS } from './linkedin/selectors'
import { canonicalJobUrl, externalLink, isLinkedInUrl, safetyRedirectTarget } from './linkedin/urls'
import { ensureLoggedIn, LoginError, loginOptionsFrom, NO_LINKEDIN_ACCOUNT } from './login'
import { downloadPostImages } from './post-images'

type LookupOptions = { config: ScraperConfig; queue: QueueClient; logger: Logger; lock: BrowserLock }

/** Sem vagas novas por esse tempo, o navegador das vagas é fechado. */
const IDLE_CLOSE_MS = 60_000
const JOB_PAGE_TIMEOUT_MS = 15_000
/** Links de agregadores passam por vários redirecionamentos (anúncios, rastreio): espera a URL parar de mudar. */
const REDIRECT_SETTLE_MS = 5_000
const REDIRECT_TIMEOUT_MS = 30_000

/**
 * Abre o link de cada vaga de um post com várias (fila `scraper-lookup`), como uma busca: uma por vez, no navegador
 * logado, com pausa depois de cada uma e nunca durante uma coleta. O texto da página vai para o post-processing. As
 * vagas de uma lista deixada para outra coleta (fora de `seen_posts`, ver `deferLists`) não são abertas. No mesmo
 * navegador e no mesmo ritmo, lê de novo os posts pedidos pelo "processar de novo" do site (fila `scraper-post`).
 */
export class JobLookupWorker {
	private session?: BrowserSession
	private idleTimer?: ReturnType<typeof setTimeout>

	constructor(private readonly options: LookupOptions) {}

	handle(lookup: JobLookup) {
		const log = this.options.logger.child({ postId: lookup.postId, link: lookup.link })

		return this.visit(async () => {
			// Dentro da trava: a coleta que deixa a lista para depois termina antes de a vaga ser vista aqui. O "processar
			// de novo" abre a vaga mesmo assim: ela já está salva
			if (!lookup.reprocessId && !(await SeenPost.exists({ postId: lookup.sourcePostId }))) {
				log.debug({ sourcePostId: lookup.sourcePostId }, 'Vaga de uma lista deixada para outra coleta: não aberta')
				return false
			}

			const page = await this.readListing(lookup, log)

			// Processada de novo, a vaga não troca a página pelas linhas do post: ela fica como estava
			if (lookup.reprocessId && !listingPageText(page)) {
				await this.reportFailure(lookup.reprocessId, lookup.postId, 'A página da vaga não abriu ou não traz a vaga')
				return true
			}

			await this.options.queue.publish(QUEUES.postProcessing, lookupToRawPost(lookup, page))
			log.info({ title: lookup.title, opened: page !== null }, '🔗 Vaga do post com várias enviada para o post-processing')
			return true
		})
	}

	/** Lê de novo o post de uma vaga avulsa ("processar de novo" do site) e o manda ao post-processing. */
	reread(request: PostReread) {
		const log = this.options.logger.child({ postId: request.postId, url: request.url })

		return this.visit(async () => {
			const post = await this.readPost(request, log)

			if (!post) {
				await this.reportFailure(request.reprocessId, request.postId, 'O post não abriu ou não foi encontrado no LinkedIn')
				return true
			}

			await this.options.queue.publish(QUEUES.postProcessing, post)
			log.info({ images: post.images.length }, '🔁 Post lido de novo e enviado para o post-processing')
			return true
		})
	}

	/**
	 * Roda `visit` na vez do navegador; se ela usou o LinkedIn (`true`), pausa antes de liberar a trava: a próxima vaga
	 * (ou coleta) só acessa o LinkedIn depois. Sem nada novo por `IDLE_CLOSE_MS`, o navegador fecha.
	 */
	private visit(visit: () => Promise<boolean>) {
		return this.options.lock.run(async () => {
			clearTimeout(this.idleTimer)

			if (await visit()) {
				const delay = this.options.config.SCRAPER_LOOKUP_DELAY_MS
				await Bun.sleep(delay + Math.random() * delay)
			}

			this.idleTimer = setTimeout(() => {
				this.options.lock.run(() => this.close()).catch(() => {})
			}, IDLE_CLOSE_MS)
		})
	}

	private async reportFailure(reprocessId: string, postId: string, reason: string) {
		const result: JobReprocessResult = { reprocessId, postId, status: 'failed', reason, keptFields: [] }
		await this.options.queue.publish(QUEUES.webReprocess, result)
		this.options.logger.warn({ postId, reason }, 'Vaga não processada de novo')
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
			const session = await this.open(lookup.link, log)

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

	/**
	 * Abre o post e lê o texto, o autor e as imagens dele, como na coleta.
	 * @returns `null` se o post não abrir ou não aparecer (apagado, sem acesso).
	 */
	private async readPost(request: PostReread, log: Logger): Promise<RawPost | null> {
		try {
			const session = await this.open(request.url, log)
			await session.page.waitForSelector(SELECTORS.postText, { timeout: JOB_PAGE_TIMEOUT_MS })

			// A página do post pode mostrar outros (sugestões) depois dele
			const posts = await collectNewPosts(session.page)
			const scraped = posts.find(post => resolvePostUrn(post.urnCandidates) === request.postId) ?? posts[0]
			if (!scraped) return null

			return {
				postId: request.postId,
				text: cleanPostText(scraped.text),
				url: request.url,
				author: scraped.author,
				authorIsCompany: scraped.authorIsCompany,
				postedAt: request.postedAt,
				scrapedAt: new Date().toISOString(),
				sourcePostId: null,
				jobLink: null,
				attachedLink: externalLink(scraped.cardLinks),
				images: await downloadPostImages(postImageUrls(scraped.images), log),
				reprocessId: request.reprocessId,
			}
		} catch (error) {
			log.warn({ err: error }, 'Não foi possível ler o post de novo')

			await this.close().catch(() => {})
			return null
		}
	}

	/** Abre o link no navegador logado; se o LinkedIn pedir o login, entra e abre de novo. */
	private async open(url: string, log: Logger) {
		// Relida a cada vaga, como na coleta: a conta salva pelo site vale sem reiniciar o serviço
		const account = (await loadCredentials('linkedin'))?.value
		if (!account) throw new LoginError(NO_LINKEDIN_ACCOUNT, 'no-account')

		const session = await this.openSession(account.liAt)
		await session.goto(url)

		// A sessão e o login só valem no LinkedIn: um site de fora com /login não é o login do LinkedIn
		if (isLinkedInUrl(session.page.url())) {
			const loggedInNow = await ensureLoggedIn(session, loginOptionsFrom(this.options.config, account, log))
			if (loggedInNow) await session.goto(url)
		}

		return session
	}

	private async openSession(liAt: string | undefined) {
		this.session ??= await BrowserSession.launch(browserOptionsFrom(this.options.config, liAt, this.options.logger))

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

/**
 * Partes da página com a vaga em sites frequentes nas listas, por domínio. No netvagas: o topo (cargo, empresa),
 * "Sobre a vaga" (a ficha) e "Descrição", os dois primeiros cards depois do topo (entre eles pode vir outro elemento, como
 * o "Receba notificações"); os cards seguintes são o aviso de redirecionamento, o ATS e dicas de currículo.
 */
const SITE_SELECTORS: Record<string, string[]> = {
	'www.netvagas.com.br': [
		'.nv-anuncio > article',
		'.nv-anuncio > article ~ section.card',
		'.nv-anuncio > article ~ section.card ~ section.card',
	],
}

/**
 * Partes do site que não são a vaga: menu, busca, rodapé, barras laterais e banners. `header` e `footer` só fora de um
 * `article`, `main` ou `section` (dentro, costumam ser o cabeçalho da própria vaga). `form` fica: em sites ASP.NET, um
 * `<form>` envolve a página inteira.
 */
const SITE_CHROME = 'nav, aside, dialog, [role=banner], [role=navigation], [role=contentinfo], [role=search], [role=dialog]'
const SITE_HEADER = 'header, footer'

/**
 * Lê o topo e a descrição de uma vaga do LinkedIn; num site conhecido, as partes da vaga (`SITE_SELECTORS`); em outro
 * (ou se o layout mudar), o `<main>` ou a página toda, sem o menu, a busca e o rodapé do site.
 */
async function readJobPage(page: Page): Promise<ListingPage> {
	if (canonicalJobUrl(page.url())) {
		await page.waitForSelector(SELECTORS.jobDescription, { timeout: JOB_PAGE_TIMEOUT_MS }).catch(() => {})
	} else {
		await waitForRedirects(page)
	}

	const text = await page.evaluate(
		({ selectors, chrome, header }) => {
			const parts = selectors.map(selector => document.querySelector<HTMLElement>(selector)?.innerText.trim() ?? '').filter(Boolean)
			if (parts.length > 0) return parts.join('\n\n')

			// Removidos da própria página (o `innerText` de uma cópia fora dela não tem as quebras de linha); a aba
			// vai para outro link depois da leitura
			for (const element of document.querySelectorAll(chrome)) element.remove()
			for (const element of document.querySelectorAll(header)) {
				if (!element.parentElement?.closest('article, main, section')) element.remove()
			}

			return (document.querySelector<HTMLElement>('main') ?? document.body)?.innerText ?? ''
		},
		{
			selectors: canonicalJobUrl(page.url())
				? [SELECTORS.jobTopCard, SELECTORS.jobDescription]
				: (SITE_SELECTORS[new URL(page.url()).hostname] ?? []),
			chrome: SITE_CHROME,
			header: SITE_HEADER,
		},
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
