import { TimeoutError, type Page } from 'puppeteer'

import type { RawPost, ScraperSettings } from '@shared/contracts'
import { SeenPost, type ScraperRunTerm, type ScraperTermErrorKind } from '@shared/database'
import { checkPostLanguage } from '@shared/language'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { readSettings } from '@shared/settings'

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

/**
 * Rolagens seguidas sem nenhum post enviado (só posts já vistos ou em outro idioma) antes de desistir do termo.
 * Rolar sem fim por uma busca que não traz nada aproveitável aumenta o risco de bloqueio da conta.
 */
const MAX_FRUITLESS_SCROLLS = 15

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

	// O filtro de idioma do post-processing, aplicado já aqui para que esses posts não gastem o limite da coleta
	const { allowedLanguages } = await readSettings('post-processing')

	const session = await BrowserSession.launch(browserOptionsFrom(config, logger))
	activeSession = session

	try {
		const results: ScraperRunTerm[] = []

		for (const [index, term] of terms.entries()) {
			const limit = limits[index] ?? 0

			// Mais termos que posts no limite: os últimos ficam sem busca, mas aparecem no histórico
			if (limit === 0) {
				logger.info({ term }, 'Termo pulado: o limite de posts da coleta já foi distribuído')
				results.push({ term, sent: 0, skipped: 0, otherLanguage: 0, postIds: [], error: null, errorKind: null, searchUrl: null })
				continue
			}

			if (results.length > 0) await humanPause()
			results.push(await scrapeTerm(session, { term, limit, seen, allowedLanguages }, options))
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

type TermSearch = { term: string; limit: number; seen: Set<string>; allowedLanguages: string[] }

/** A busca de um termo não trouxe posts; `kind` diz o motivo para o histórico. */
class SearchError extends Error {
	constructor(
		readonly kind: ScraperTermErrorKind,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options)
	}
}

async function scrapeTerm(session: BrowserSession, search: TermSearch, options: ScrapeOptions): Promise<ScraperRunTerm> {
	const logger = options.logger.child({ term: search.term })
	const searchUrl = buildSearchUrl({ keywords: search.term, datePosted: options.settings.datePosted })

	try {
		const page = await openSearchResults(session, searchUrl, { ...options, logger })
		const { sent, skipped, otherLanguage, postIds } = await publishNewPosts(page, search, { ...options, logger })

		return { term: search.term, sent, skipped, otherLanguage, postIds, error: null, errorKind: null, searchUrl }
	} catch (error) {
		if (error instanceof LoginError) throw error

		const kind = error instanceof SearchError ? error.kind : error instanceof TimeoutError ? 'timeout' : 'unknown'
		if (kind === 'empty') logger.info('A busca deste termo não tem resultados')
		else logger.error({ err: error }, 'Falha na busca deste termo')

		return {
			term: search.term,
			sent: 0,
			skipped: 0,
			otherLanguage: 0,
			postIds: [],
			error: error instanceof Error ? error.message : String(error),
			errorKind: kind,
			searchUrl,
		}
	}
}

/**
 * Abre a busca do termo, faz login se o LinkedIn pedir e espera os resultados.
 * @throws {SearchError} Se nenhum post aparecer (`empty` quando o LinkedIn avisa que a busca não tem resultados).
 */
async function openSearchResults(session: BrowserSession, searchUrl: string, { config, logger }: ScrapeOptions): Promise<Page> {
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

	// Espera os posts ou o aviso de busca sem resultados, o que aparecer primeiro
	const found = await page
		.waitForFunction(
			(postSelector, noResults): 'posts' | 'empty' | false => {
				if (document.querySelector(postSelector)) return 'posts'
				return new RegExp(noResults.source, noResults.flags).test(document.body?.innerText ?? '') ? 'empty' : false
			},
			{ timeout: RESULTS_TIMEOUT_MS },
			`${SELECTORS.post}, ${SELECTORS.postText}`,
			{ source: SELECTORS.noResultsText.source, flags: SELECTORS.noResultsText.flags },
		)
		.then(handle => handle.jsonValue() as Promise<'posts' | 'empty'>)
		.catch((error: unknown) => {
			if (error instanceof TimeoutError) return null
			throw error
		})

	if (found === 'empty') throw new SearchError('empty', 'O LinkedIn não encontrou resultados para esta busca')
	if (!found) {
		throw new SearchError(
			'no-posts',
			`Nenhum post encontrado em ${page.url()}. A busca pode estar vazia ou os seletores em src/services/scraper/linkedin/selectors.ts estão desatualizados.`,
		)
	}

	logger.info('🫡 Resultados carregados, iniciando coleta')
	return page
}

/**
 * Rola a busca enviando cada post novo para a fila, até o limite do termo, o fim dos resultados ou muitas rolagens
 * seguidas sem nada para enviar. Posts que já passaram pela IA e posts em outro idioma não são enviados nem contam
 * no limite. Posts já vistos não param a busca: a coleta anterior pode ter parado no limite antes dos mais antigos.
 */
async function publishNewPosts(page: Page, { limit, seen, allowedLanguages }: TermSearch, { config, queue, logger }: ScrapeOptions) {
	let sent = 0
	let skipped = 0
	let otherLanguage = 0
	const postIds: string[] = []
	let hasMore = true
	let fruitlessScrolls = 0

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
		let unseenNow = 0

		for (const post of candidates) {
			if (sent >= limit) break

			if (processed.has(post.postId)) {
				skipped++
				continue
			}

			unseenNow++

			const { rejection } = checkPostLanguage(post.text, allowedLanguages)
			if (rejection) {
				await markAsOtherLanguage(post.postId)
				otherLanguage++
				logger.debug({ postId: post.postId, reason: rejection }, 'Post em outro idioma ignorado')
				continue
			}

			await queue.publish(QUEUES.postProcessing, post)
			postIds.push(post.postId)
			sent++
			sentNow++

			logger.debug({ postId: post.postId, url: post.url }, '📨 Post enviado para a fila')
		}

		logger.info(
			{ found: candidates.length, sent: sentNow, otherLanguage: unseenNow - sentNow, skipped: candidates.length - unseenNow },
			'Posts nesta rolagem',
		)

		// Quando nada novo carregou, a coleta acima foi a última (pega posts que renderizaram depois)
		if (sent >= limit || !hasMore) break

		fruitlessScrolls = sentNow > 0 ? 0 : fruitlessScrolls + 1
		if (fruitlessScrolls >= MAX_FRUITLESS_SCROLLS) {
			logger.info({ scrolls: fruitlessScrolls }, 'Rolagens seguidas sem nenhum post para enviar: a busca do termo para')
			break
		}

		await humanPause()
		hasMore = await loadMorePosts(page, config.SCRAPER_SCROLL_DELAY_MS)
	}

	return { sent, skipped, otherLanguage, postIds }
}

/** Registra o post como visto, para as próximas coletas o pularem como fariam com um descartado pelo post-processing. */
function markAsOtherLanguage(postId: string) {
	return SeenPost.updateOne({ postId }, { $setOnInsert: { postId, isJob: false, outcome: 'language' } }, { upsert: true })
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
