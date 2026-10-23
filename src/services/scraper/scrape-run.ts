import { TimeoutError, type Page } from 'puppeteer'

import { activeSearchTerms, type CredentialsOf, type RawPost, type ScraperSettings } from '@shared/contracts'
import { SeenPost, type ScraperRunTerm, type ScraperTermErrorKind, type SeenPostOutcome } from '@shared/database'
import { checkPostLanguage } from '@shared/language'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials, readSettings } from '@shared/settings'

import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { collectNewPosts, loadMorePosts, type ScrapedPost } from './feed-reader'
import { cleanPostText } from './linkedin/post-text'
import { postedAtFromUrn, postUrlFromUrn, resolvePostUrn } from './linkedin/post-urn'
import { SELECTORS } from './linkedin/selectors'
import { buildSearchUrl, externalLink, LOGIN_URL } from './linkedin/urls'
import { ensureLoggedIn, LoginError, loginOptionsFrom, NO_LINKEDIN_ACCOUNT } from './login'
import { hashPost } from './post-id'
import { postsPerTerm } from './schedule'

type ScrapeOptions = { config: ScraperConfig; settings: ScraperSettings; queue: QueueClient; logger: Logger }

/** As opções da coleta com a conta do LinkedIn, lida no começo de cada uma. */
type RunOptions = ScrapeOptions & { account: CredentialsOf<'linkedin'> }

const RESULTS_TIMEOUT_MS = 30_000

/**
 * Rolagens seguidas sem nenhum post enviado (só posts já vistos ou em outro idioma) antes de desistir do termo.
 * Rolar sem fim por uma busca que não traz nada aproveitável aumenta o risco de bloqueio da conta.
 */
const MAX_FRUITLESS_SCROLLS = 15

/** Destinos do post-processing que mantêm o post no limite; os outros são descartes e liberam o lugar dele. */
const KEPT_OUTCOMES: ReadonlySet<SeenPostOutcome> = new Set(['saved', 'multi-job'])

/** Intervalo entre as consultas do destino dos posts enviados, enquanto a coleta espera a IA. */
const OUTCOME_POLL_MS = 5_000

/**
 * Tempo sem nenhum destino novo até a coleta parar de esperar a IA (post-processing parado ou fila travada).
 * Os posts sem destino contam como mantidos, para a coleta não passar do limite.
 */
const OUTCOME_STALL_MS = 10 * 60_000

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

	const terms = activeSearchTerms(settings)

	// O que falta do limite, dividido entre os termos que faltam: o que um termo não completar passa para os seguintes
	let remaining = settings.maxPostsPerRun

	// Compartilhado entre os termos: um post que aparece em duas buscas só é enviado uma vez
	const seen = new Set<string>()

	// A conta é relida a cada coleta: a salva pelo site vale sem reiniciar o serviço
	const account = (await loadCredentials('linkedin'))?.value
	if (!account) throw new LoginError(NO_LINKEDIN_ACCOUNT, 'no-account')
	const runOptions: RunOptions = { ...options, account }

	// O filtro de idioma do post-processing, aplicado já aqui para que esses posts não gastem o limite da coleta
	const { allowedLanguages } = await readSettings('post-processing')

	const session = await BrowserSession.launch(browserOptionsFrom(config, account.liAt, logger))
	activeSession = session

	try {
		const results: ScraperRunTerm[] = []

		for (const [index, term] of terms.entries()) {
			const limit = postsPerTerm(remaining, terms.length - index)[0] ?? 0

			// Limite já completado pelos termos anteriores (ou mais termos que posts): os seguintes ficam sem busca, mas
			// aparecem no histórico
			if (limit === 0) {
				logger.info({ term }, 'Termo pulado: o limite de posts da coleta já foi completado ou distribuído')
				results.push({ term, sent: 0, skipped: 0, otherLanguage: 0, postIds: [], error: null, errorKind: null, searchUrl: null })
				continue
			}

			if (results.length > 0) await humanPause()
			const { kept, ...result } = await scrapeTerm(session, { term, limit, seen, allowedLanguages }, runOptions)
			results.push(result)
			remaining -= kept
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

/** O resultado do termo para o histórico e quantos dos posts enviados ficaram no limite (`kept`). */
async function scrapeTerm(
	session: BrowserSession,
	search: TermSearch,
	options: RunOptions,
): Promise<ScraperRunTerm & { kept: number }> {
	const logger = options.logger.child({ term: search.term })
	const searchUrl = buildSearchUrl({ keywords: search.term, datePosted: options.settings.datePosted })

	try {
		const page = await openSearchResults(session, searchUrl, { ...options, logger })
		const { sent, kept, skipped, otherLanguage, postIds } = await publishNewPosts(page, search, { ...options, logger })

		return { term: search.term, sent, kept, skipped, otherLanguage, postIds, error: null, errorKind: null, searchUrl }
	} catch (error) {
		if (error instanceof LoginError) throw error

		const kind = error instanceof SearchError ? error.kind : error instanceof TimeoutError ? 'timeout' : 'unknown'
		if (kind === 'empty') logger.info('A busca deste termo não tem resultados')
		else logger.error({ err: error }, 'Falha na busca deste termo')

		return {
			term: search.term,
			sent: 0,
			kept: 0,
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
async function openSearchResults(session: BrowserSession, searchUrl: string, { config, account, logger }: RunOptions): Promise<Page> {
	logger.info({ searchUrl }, '🔎 Abrindo a busca do LinkedIn')

	try {
		await session.page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
	} catch (error) {
		// Cookies inválidos podem causar loop de redirecionamento: recomeça sem eles e faz login
		logger.warn({ err: error }, '🚫 Falha ao carregar a busca, tentando de novo sem os cookies salvos')
		await session.newContext({ withCookies: false })
		await session.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
	}

	const loggedInNow = await ensureLoggedIn(session, loginOptionsFrom(config, account, logger))
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
 * seguidas sem nada para enviar. Só contam no limite os posts que a IA não descartar: com o limite ocupado por posts
 * ainda na fila, a busca espera o destino deles, e cada descarte libera o lugar para mais um. Posts que já passaram
 * pela IA e posts em outro idioma não são enviados nem contam. Posts já vistos não param a busca: a coleta anterior
 * pode ter parado no limite antes dos mais antigos.
 */
async function publishNewPosts(page: Page, { limit, seen, allowedLanguages }: TermSearch, { config, queue, logger }: ScrapeOptions) {
	let sent = 0
	let kept = 0
	let skipped = 0
	let otherLanguage = 0
	const postIds: string[] = []
	/** Enviados que o post-processing ainda não terminou. */
	const pending = new Set<string>()
	/** Posts lidos que ainda não couberam no limite, enviados quando um descarte liberar lugar. */
	const backlog: RawPost[] = []
	let hasMore = true
	let fruitlessScrolls = 0
	let readOnce = false
	const canRead = () => hasMore && fruitlessScrolls < MAX_FRUITLESS_SCROLLS

	// Limite de posts por coleta (dividido entre os termos) para reduzir o risco de bloqueio da conta
	while (kept < limit) {
		// Só rola quando não sobrou post lido para enviar
		if (backlog.length === 0 && canRead()) {
			if (readOnce) {
				await humanPause()
				hasMore = await loadMorePosts(page, config.SCRAPER_SCROLL_DELAY_MS)
			}
			readOnce = true

			// Quando nada novo carregou, esta leitura é a última (pega posts que renderizaram depois)
			const read = await readNewPosts(page, { seen, allowedLanguages, logger })
			skipped += read.skipped
			otherLanguage += read.otherLanguage
			backlog.push(...read.usable)

			fruitlessScrolls = read.usable.length > 0 ? 0 : fruitlessScrolls + 1
			if (fruitlessScrolls >= MAX_FRUITLESS_SCROLLS) {
				logger.info({ scrolls: fruitlessScrolls }, 'Rolagens seguidas sem nenhum post para enviar: a busca do termo para')
			}
		}

		while (backlog.length > 0 && kept + pending.size < limit) {
			const post = backlog.shift()!
			await queue.publish(QUEUES.postProcessing, post)
			postIds.push(post.postId)
			pending.add(post.postId)
			sent++

			logger.debug({ postId: post.postId, url: post.url }, '📨 Post enviado para a fila')
		}

		kept += await settleOutcomes(pending)
		if (kept >= limit) break

		// Sem mais posts para ler: espera o destino de todos, e o que sobrar do limite passa para o próximo termo
		if (backlog.length === 0 && !canRead()) {
			kept += (await waitForOutcomes(pending, { all: true, logger })).kept
			break
		}

		// Limite ocupado por posts ainda na IA: basta um destino para saber se abriu lugar
		if (kept + pending.size >= limit) {
			const settled = await waitForOutcomes(pending, { all: false, logger })
			kept += settled.kept
			if (settled.stalled) break
		}
	}

	return { sent, kept, skipped, otherLanguage, postIds }
}

/**
 * Lê os posts novos da busca: os que podem ir para a IA e quantos foram pulados (já processados em coletas
 * anteriores) ou estão em outro idioma.
 */
async function readNewPosts(
	page: Page,
	{ seen, allowedLanguages, logger }: Pick<TermSearch, 'seen' | 'allowedLanguages'> & { logger: Logger },
) {
	const candidates: RawPost[] = []

	for (const scraped of await collectNewPosts(page)) {
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
	const usable: RawPost[] = []
	let otherLanguage = 0

	for (const post of candidates) {
		if (processed.has(post.postId)) continue

		const { rejection } = checkPostLanguage(post.text, allowedLanguages)
		if (rejection) {
			await markAsOtherLanguage(post.postId)
			otherLanguage++
			logger.debug({ postId: post.postId, reason: rejection }, 'Post em outro idioma ignorado')
			continue
		}

		usable.push(post)
	}

	const skipped = processed.size
	logger.info({ found: candidates.length, usable: usable.length, otherLanguage, skipped }, 'Posts nesta rolagem')

	return { usable, skipped, otherLanguage }
}

/**
 * Tira de `pending` os posts que o post-processing já terminou.
 * @returns Quantos deles ficam no limite (não foram descartados).
 */
async function settleOutcomes(pending: Set<string>) {
	if (pending.size === 0) return 0

	const docs = await SeenPost.find({ postId: { $in: [...pending] } }, { postId: 1, isJob: 1, outcome: 1 }).lean()
	let kept = 0

	for (const doc of docs) {
		pending.delete(doc.postId)
		if (doc.outcome ? KEPT_OUTCOMES.has(doc.outcome) : doc.isJob) kept++
	}

	return kept
}

/**
 * Espera o post-processing terminar um dos posts em `pending` (ou todos, com `all`). Se nenhum destino chegar em
 * `OUTCOME_STALL_MS`, desiste (`stalled`) e conta os que faltam como mantidos.
 */
async function waitForOutcomes(pending: Set<string>, { all, logger }: { all: boolean; logger: Logger }) {
	let kept = 0
	if (pending.size === 0) return { kept, stalled: false }

	logger.info({ pending: pending.size }, '⏳ Esperando a IA: cada post descartado libera lugar no limite')
	let lastProgress = Date.now()

	while (pending.size > 0) {
		await Bun.sleep(OUTCOME_POLL_MS)

		const before = pending.size
		kept += await settleOutcomes(pending)

		if (pending.size < before) {
			if (!all) break
			lastProgress = Date.now()
		} else if (Date.now() - lastProgress >= OUTCOME_STALL_MS) {
			logger.warn(
				{ pending: pending.size },
				'A IA não terminou os posts enviados a tempo: eles contam no limite e a busca do termo para',
			)
			kept += pending.size
			pending.clear()
			return { kept, stalled: true }
		}
	}

	return { kept, stalled: false }
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
