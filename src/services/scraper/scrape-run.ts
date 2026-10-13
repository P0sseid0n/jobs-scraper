import type { Page } from 'puppeteer'

import type { RawPost, ScraperSettings } from '@shared/contracts'
import { SeenPost, type ScraperRunTerm } from '@shared/database'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'

import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { collectNewPosts, loadMorePosts, type ScrapedPost } from './feed-reader'
import { cleanPostText } from './linkedin/post-text'
import { postedAtFromUrn, postUrlFromUrn, resolvePostUrn } from './linkedin/post-urn'
import { SELECTORS } from './linkedin/selectors'
import { buildSearchUrl, externalLink, LOGIN_URL } from './linkedin/urls'
import { ensureLoggedIn, LoginError, loginOptionsFrom } from './login'
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
	const limits = postsPerTerm(settings.maxPostsPerRun, terms.length)

	// Compartilhado entre os termos: um post que aparece em duas buscas só é enviado uma vez
	const seen = new Set<string>()

	const session = await BrowserSession.launch(browserOptionsFrom(config, logger))
	activeSession = session

	try {
		const results: ScraperRunTerm[] = []

		for (const [index, term] of terms.entries()) {
			const limit = limits[index] ?? 0

			// Mais termos que posts no limite: os últimos ficam sem busca, mas aparecem no histórico
			if (limit === 0) {
				logger.info({ term }, 'Termo pulado: o limite de posts da coleta já foi distribuído')
				results.push({ term, sent: 0, skipped: 0, postIds: [], error: null })
				continue
			}

			if (results.length > 0) await humanPause()
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
		const { sent, skipped, postIds } = await publishNewPosts(page, search, { ...options, logger })

		return { term: search.term, sent, skipped, postIds, error: null }
	} catch (error) {
		if (error instanceof LoginError) throw error

		logger.error({ err: error }, 'Falha na busca deste termo')

		return { term: search.term, sent: 0, skipped: 0, postIds: [], error: error instanceof Error ? error.message : String(error) }
	}
}

/**
 * Abre a busca do termo, faz login se o LinkedIn pedir e espera os resultados.
 * @throws Se nenhum post aparecer.
 */
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

	const loggedInNow = await ensureLoggedIn(session, loginOptionsFrom(config, logger))
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

/**
 * Rola a busca enviando cada post novo para a fila, até o limite do termo ou o fim dos resultados. Posts que já
 * passaram pela IA não são enviados nem contam no limite. A busca é ordenada por data: quando uma rolagem só traz
 * posts já processados, o resto é mais antigo e a busca do termo para.
 */
async function publishNewPosts(page: Page, { limit, seen }: TermSearch, { config, queue, logger }: ScrapeOptions) {
	let sent = 0
	let skipped = 0
	const postIds: string[] = []
	let hasMore = true

	// Limite de posts por coleta (dividido entre os termos) para reduzir o risco de bloqueio da conta
	while (sent < limit) {
		const posts = await collectNewPosts(page)
		const candidates: RawPost[] = []

		for (const scraped of posts) {
			const post = toRawPost(scraped)

			// Sem o id não há link do post: a vaga não serviria. O aviso mostra um formato novo do LinkedIn na hora.
			if (!post) {
				const text = cleanPostText(scraped.text)
				if (!seen.has(hashPost(text))) {
					seen.add(hashPost(text))
					logger.warn(
						{ candidates: scraped.urnCandidates.length, text: text.slice(0, 80) },
						'Post sem id reconhecível ignorado (ver resolvePostUrn em linkedin/post-urn.ts)',
					)
				}
				continue
			}

			const textHash = hashPost(post.text)
			if (seen.has(post.postId) || seen.has(textHash)) continue

			seen.add(post.postId).add(textHash)
			candidates.push(post)
		}

		const processed = await alreadyProcessed(candidates.map(post => post.postId))
		let sentNow = 0

		for (const post of candidates) {
			if (sent >= limit) break

			if (processed.has(post.postId)) {
				skipped++
				continue
			}

			await queue.publish(QUEUES.postProcessing, post)
			postIds.push(post.postId)
			sent++
			sentNow++

			logger.debug({ postId: post.postId, url: post.url }, '📨 Post enviado para a fila')
		}

		logger.info({ found: candidates.length, sent: sentNow, skipped: candidates.length - sentNow }, 'Posts nesta rolagem')

		if (candidates.length > 0 && sentNow === 0 && sent < limit) {
			logger.info('Só posts já processados nesta rolagem: o resto da busca é mais antigo')
			break
		}

		// Quando nada novo carregou, a coleta acima foi a última (pega posts que renderizaram depois)
		if (sent >= limit || !hasMore) break

		await humanPause()
		hasMore = await loadMorePosts(page, config.SCRAPER_SCROLL_DELAY_MS)
	}

	return { sent, skipped, postIds }
}

/** Ids, entre os dados, de posts que já passaram pela IA em coletas anteriores. */
async function alreadyProcessed(postIds: string[]) {
	if (postIds.length === 0) return new Set<string>()

	const docs = await SeenPost.find({ postId: { $in: postIds } }, { postId: 1 }).lean()
	return new Set(docs.map(doc => doc.postId))
}

/** O post para a fila, ou `null` se o id dele não for encontrado (sem ele não há link do post). */
function toRawPost(post: ScrapedPost): RawPost | null {
	const urn = resolvePostUrn(post.urnCandidates)
	if (!urn) return null

	return {
		postId: urn,
		text: cleanPostText(post.text),
		url: postUrlFromUrn(urn),
		author: post.author,
		postedAt: postedAtFromUrn(urn),
		scrapedAt: new Date().toISOString(),
		sourcePostId: null,
		jobLink: null,
		attachedLink: externalLink(post.cardLinks),
	}
}

/** Pausa por um tempo aleatório, para não ter ritmo de robô. */
export function humanPause() {
	return Bun.sleep(1_500 + Math.random() * 2_500)
}
