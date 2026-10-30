import { TimeoutError, type Page } from 'puppeteer'

import type { CredentialsOf, DatePostedFilter, RawPost, ScraperSettings } from '@shared/contracts'
import { SeenPost, type ScraperRunTerm, type ScraperTermErrorKind, type SeenPostOutcome } from '@shared/database'
import { checkPostLanguage } from '@shared/language'
import type { Logger } from '@shared/logging'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials, readSettings } from '@shared/settings'

import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { collectNewPosts, loadMorePosts, type ScrapedPost } from './feed-reader'
import { postImageUrls } from './linkedin/post-images'
import { cleanPostText } from './linkedin/post-text'
import { postedAtFromUrn, postUrlFromUrn, resolvePostUrn } from './linkedin/post-urn'
import { SELECTORS } from './linkedin/selectors'
import { buildSearchUrl, externalLink, LOGIN_URL } from './linkedin/urls'
import { ensureLoggedIn, LoginError, loginOptionsFrom, NO_LINKEDIN_ACCOUNT } from './login'
import { hashPost } from './post-id'
import { downloadPostImages } from './post-images'
import type { TermProgress } from './run-history'
import { jobsPerTerm, widerDatePosted } from './schedule'

type ScrapeOptions = {
	config: ScraperConfig
	settings: ScraperSettings
	/** Os termos ativos, na ordem em que são buscados (ver `rankTerms`). */
	terms: string[]
	queue: QueueClient
	logger: Logger
	/** Chamado a cada termo terminado, com os resultados até ali. */
	onTerm?: TermProgress
	/** Interrompe a coleta: fecha o navegador e não busca mais nenhum termo. */
	signal?: AbortSignal
}

/** As opções da coleta com a conta do LinkedIn, lida no começo de cada uma. */
type RunOptions = ScrapeOptions & { account: CredentialsOf<'linkedin'> }

const RESULTS_TIMEOUT_MS = 30_000

/**
 * Rolagens seguidas sem nenhum post enviado (só posts já vistos ou em outro idioma) antes de desistir do termo, mesmo
 * sem completar o mínimo de vagas.
 * Rolar sem fim por uma busca que não traz nada aproveitável aumenta o risco de bloqueio da conta.
 */
const MAX_FRUITLESS_SCROLLS = 15

/**
 * Destinos do post-processing que contam no mínimo de vagas. Uma lista de vagas (`multi-job`) não conta: as vagas dela
 * só são abertas depois da coleta, que usa o mesmo navegador, e podem não virar nenhuma vaga nova.
 */
const JOB_OUTCOMES: ReadonlySet<SeenPostOutcome> = new Set(['saved'])

/** Intervalo entre as consultas do destino dos posts enviados, enquanto a coleta espera a IA. */
const OUTCOME_POLL_MS = 5_000

/**
 * Tempo sem nenhum destino novo até a coleta parar de esperar a IA (post-processing parado ou fila travada).
 * Os posts sem destino contam como vagas, para os termos seguintes não ficarem esperando a IA parada.
 */
const OUTCOME_STALL_MS = 10 * 60_000

/** Navegador da coleta em andamento, para ser fechado se o serviço for encerrado no meio. */
let activeSession: BrowserSession | undefined

export function closeActiveBrowser() {
	return activeSession?.close()
}

/**
 * O resultado de cada termo, as listas de vagas deixadas para outra coleta (`deferLists`) e quantas vagas faltaram
 * para o mínimo.
 */
export type ScrapeResult = { terms: ScraperRunTerm[]; deferredLists: string[]; missingJobs: number }

/**
 * Faz uma coleta: busca cada termo em sequência e envia os posts novos para a fila. Se as buscas acabarem sem completar
 * o mínimo de vagas, refaz a busca dos termos com um período mais amplo (24h → semana → mês → qualquer data), como quem
 * aumenta a área de busca quando demora a achar. Com o mínimo de vagas completo, as listas de vagas da coleta ficam
 * para outra (ver `deferLists`).
 * @returns O resultado de cada termo (um termo que falhar não impede os outros) e as listas deixadas para depois.
 */
export async function scrapeOnce(options: ScrapeOptions): Promise<ScrapeResult> {
	const { config, settings, terms, logger } = options

	// O que falta do mínimo, dividido entre os termos que faltam: o que um termo não completar passa para os seguintes
	let remaining = settings.minJobsPerRun

	// Compartilhado entre os termos: um post que aparece em duas buscas só é enviado uma vez
	const seen = new Set<string>()

	// A conta é relida a cada coleta: a salva pelo site vale sem reiniciar o serviço
	const account = (await loadCredentials('linkedin'))?.value
	if (!account) throw new LoginError(NO_LINKEDIN_ACCOUNT, 'no-account')
	const runOptions: RunOptions = { ...options, account }

	// O filtro de idioma do post-processing, aplicado já aqui para que a coleta não espere a IA descartar esses posts
	const { allowedLanguages } = await readSettings('post-processing')

	const session = await BrowserSession.launch(browserOptionsFrom(config, account.liAt, logger))
	activeSession = session
	// Fechar o navegador faz a busca em andamento falhar na hora; o termo seguinte nem começa
	const interrupt = () => void session.close().catch(() => {})
	options.signal?.addEventListener('abort', interrupt, { once: true })

	try {
		const results: ScraperRunTerm[] = []
		let datePosted: DatePostedFilter | null = settings.datePosted

		while (datePosted) {
			// Na ampliação, só os termos cuja busca funcionou (ou veio vazia no período menor)
			const round = results.length === 0 ? terms : results.filter(canWiden).map(result => result.term)

			for (const [index, term] of round.entries()) {
				options.signal?.throwIfAborted()
				const target = jobsPerTerm(remaining, round.length - index)[0] ?? 0
				const previous = results.find(result => result.term === term)

				// Mínimo já completado pelos termos anteriores: a coleta para, e os termos seguintes ficam sem busca, mas
				// aparecem no histórico
				if (target === 0) {
					if (previous) continue
					logger.info({ term }, 'Termo pulado: o mínimo de vagas da coleta já foi completado')
					results.push({
						term,
						sent: 0,
						skipped: 0,
						otherLanguage: 0,
						postIds: [],
						error: null,
						errorKind: null,
						searchUrl: null,
						datePosted: null,
					})
					await options.onTerm?.([...results])
					continue
				}

				if (results.length > 0) await humanPause()
				const { jobs, ...result } = await scrapeTerm(session, { term, target, seen, allowedLanguages, datePosted }, runOptions)
				if (previous) Object.assign(previous, mergeTermResults(previous, result))
				else results.push(result)
				remaining -= jobs
				await options.onTerm?.([...results])
			}

			datePosted = remaining > 0 ? widerDatePosted(datePosted) : null
			if (datePosted && results.some(canWiden)) {
				logger.info({ datePosted, missing: remaining }, '🔭 As buscas acabaram antes do mínimo: ampliando o período')
			} else datePosted = null
		}

		// Renova a sessão salva (o LinkedIn atualiza os cookies durante a navegação)
		await session.saveCookies()

		const sent = results.reduce((total, result) => total + result.sent, 0)
		if (remaining > 0) logger.info({ missing: remaining }, 'As buscas acabaram antes de completar o mínimo de vagas')

		const deferredLists = remaining > 0 ? [] : await deferLists(results.flatMap(result => result.postIds))
		if (deferredLists.length > 0) {
			logger.info({ lists: deferredLists.length }, 'Mínimo completo: as listas de vagas da coleta ficam para outra')
		}
		logger.info({ sent, terms: results.length }, '✅ Coleta finalizada')

		return { terms: results, deferredLists, missingJobs: Math.max(remaining, 0) }
	} finally {
		options.signal?.removeEventListener('abort', interrupt)
		activeSession = undefined
		await session.close()
	}
}

type TermSearch = { term: string; target: number; seen: Set<string>; allowedLanguages: string[]; datePosted: DatePostedFilter }

/** Se o termo pode ser buscado de novo num período mais amplo: a busca funcionou ou não teve resultados. */
function canWiden(result: ScraperRunTerm) {
	return !result.error || result.errorKind === 'empty'
}

/**
 * Junta o resultado do termo no período mais amplo ao do período anterior. Se a busca ampliada falhar, fica o
 * resultado anterior (com os posts já enviados), a não ser que ele também não tenha trazido nada.
 */
function mergeTermResults(previous: ScraperRunTerm, wider: ScraperRunTerm): ScraperRunTerm {
	if (previous.error) return wider
	if (wider.error) return previous

	return {
		...wider,
		sent: previous.sent + wider.sent,
		skipped: previous.skipped + wider.skipped,
		otherLanguage: previous.otherLanguage + wider.otherLanguage,
		postIds: [...previous.postIds, ...wider.postIds],
	}
}

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

/** O resultado do termo para o histórico e quantos dos posts enviados viraram vaga (`jobs`). */
async function scrapeTerm(
	session: BrowserSession,
	search: TermSearch,
	options: RunOptions,
): Promise<ScraperRunTerm & { jobs: number }> {
	const logger = options.logger.child({ term: search.term, datePosted: search.datePosted })
	const { datePosted } = search
	const searchUrl = buildSearchUrl({ keywords: search.term, datePosted })

	try {
		const page = await openSearchResults(session, searchUrl, { ...options, logger })
		const { sent, jobs, skipped, otherLanguage, postIds } = await publishNewPosts(page, search, { ...options, logger })

		return { term: search.term, sent, jobs, skipped, otherLanguage, postIds, error: null, errorKind: null, searchUrl, datePosted }
	} catch (error) {
		// Coleta interrompida: o erro é do navegador fechado no meio, não da busca
		if (error instanceof LoginError || options.signal?.aborted) throw error

		const kind = error instanceof SearchError ? error.kind : error instanceof TimeoutError ? 'timeout' : 'unknown'
		if (kind === 'empty') logger.info('A busca deste termo não tem resultados')
		else logger.error({ err: error }, 'Falha na busca deste termo')

		return {
			term: search.term,
			sent: 0,
			jobs: 0,
			skipped: 0,
			otherLanguage: 0,
			postIds: [],
			error: error instanceof Error ? error.message : String(error),
			errorKind: kind,
			searchUrl,
			datePosted,
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
 * Rola a busca enviando cada post novo para a fila até o termo completar a parte dele do mínimo de vagas. Só para antes
 * no fim dos resultados ou depois de muitas rolagens seguidas sem nada para enviar (risco de bloqueio da conta). Só
 * contam os posts que viram vaga: com posts na fila suficientes para completar o mínimo, a busca espera o destino
 * deles, e cada um que não vira vaga abre lugar para mais um. Posts que já passaram pela IA e posts em outro idioma não
 * são enviados nem contam. Posts já vistos não param a busca: a coleta anterior pode ter parado no mínimo antes dos
 * mais antigos.
 */
async function publishNewPosts(page: Page, { target, seen, allowedLanguages }: TermSearch, { config, queue, logger }: ScrapeOptions) {
	let sent = 0
	let jobs = 0
	let skipped = 0
	let otherLanguage = 0
	const postIds: string[] = []
	/** Enviados que o post-processing ainda não terminou. */
	const pending = new Set<string>()
	/** Posts lidos ainda não enviados, à espera de a IA mostrar que os da fila não completam o mínimo. */
	const backlog: RawPost[] = []
	/** URLs das imagens de cada post do backlog, baixadas só no envio: os pulados não gastam download. */
	const imageUrls = new Map<string, string[][]>()
	let hasMore = true
	let fruitlessScrolls = 0
	let readOnce = false
	const canRead = () => hasMore && fruitlessScrolls < MAX_FRUITLESS_SCROLLS

	while (jobs < target) {
		// Só rola quando não sobrou post lido para enviar
		if (backlog.length === 0 && canRead()) {
			if (readOnce) {
				await humanPause()
				hasMore = await loadMorePosts(page, config.SCRAPER_SCROLL_DELAY_MS)
			}
			readOnce = true

			// Quando nada novo carregou, esta leitura é a última (pega posts que renderizaram depois)
			const read = await readNewPosts(page, { seen, allowedLanguages, imageUrls, logger })
			skipped += read.skipped
			otherLanguage += read.otherLanguage
			backlog.push(...read.usable)

			fruitlessScrolls = read.usable.length > 0 ? 0 : fruitlessScrolls + 1
			if (fruitlessScrolls >= MAX_FRUITLESS_SCROLLS) {
				logger.info({ scrolls: fruitlessScrolls }, 'Rolagens seguidas sem nenhum post para enviar: a busca do termo para')
			}
		}

		while (backlog.length > 0 && jobs + pending.size < target) {
			const post = backlog.shift()!
			const images = await downloadPostImages(imageUrls.get(post.postId) ?? [], logger)
			imageUrls.delete(post.postId)
			await queue.publish(QUEUES.postProcessing, { ...post, images })
			postIds.push(post.postId)
			pending.add(post.postId)
			sent++

			logger.debug({ postId: post.postId, url: post.url, images: images.length }, '📨 Post enviado para a fila')
		}

		jobs += await settleOutcomes(pending)
		if (jobs >= target) break

		// Sem mais posts para ler: espera o destino de todos, e o que faltar do mínimo passa para o próximo termo
		if (backlog.length === 0 && !canRead()) {
			jobs += (await waitForOutcomes(pending, { all: true, logger })).jobs
			break
		}

		// Posts na IA suficientes para completar o mínimo: basta um destino para saber se ainda falta
		if (jobs + pending.size >= target) {
			const settled = await waitForOutcomes(pending, { all: false, logger })
			jobs += settled.jobs
			if (settled.stalled) break
		}
	}

	return { sent, jobs, skipped, otherLanguage, postIds }
}

/**
 * Lê os posts novos da busca: os que podem ir para a IA e quantos foram pulados (já processados em coletas
 * anteriores) ou estão em outro idioma. As URLs das imagens dos que podem ir ficam em `imageUrls`.
 */
async function readNewPosts(
	page: Page,
	{
		seen,
		allowedLanguages,
		imageUrls,
		logger,
	}: Pick<TermSearch, 'seen' | 'allowedLanguages'> & { imageUrls: Map<string, string[][]>; logger: Logger },
) {
	const candidates: RawPost[] = []
	const candidateImages = new Map<string, string[][]>()

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
		candidateImages.set(post.postId, postImageUrls(scraped.images))
	}

	const processed = await alreadyProcessed(candidates.map(post => post.postId))
	const usable: RawPost[] = []
	let otherLanguage = 0

	for (const post of candidates) {
		if (processed.has(post.postId)) continue

		const { rejection } = checkPostLanguage(post.text, allowedLanguages)
		if (rejection) {
			await markAsOtherLanguage(post.postId, rejection)
			otherLanguage++
			logger.debug({ postId: post.postId, reason: rejection }, 'Post em outro idioma ignorado')
			continue
		}

		usable.push(post)
		imageUrls.set(post.postId, candidateImages.get(post.postId) ?? [])
	}

	const skipped = processed.size
	logger.info({ found: candidates.length, usable: usable.length, otherLanguage, skipped }, 'Posts nesta rolagem')

	return { usable, skipped, otherLanguage }
}

/**
 * Tira de `pending` os posts que o post-processing já terminou.
 * @returns Quantos deles viraram vaga.
 */
async function settleOutcomes(pending: Set<string>) {
	if (pending.size === 0) return 0

	const docs = await SeenPost.find({ postId: { $in: [...pending] } }, { postId: 1, isJob: 1, outcome: 1 }).lean()
	let jobs = 0

	for (const doc of docs) {
		pending.delete(doc.postId)
		if (doc.outcome ? JOB_OUTCOMES.has(doc.outcome) : doc.isJob) jobs++
	}

	return jobs
}

/**
 * Espera o post-processing terminar um dos posts em `pending` (ou todos, com `all`). Se nenhum destino chegar em
 * `OUTCOME_STALL_MS`, desiste (`stalled`) e conta os que faltam como vagas.
 */
async function waitForOutcomes(pending: Set<string>, { all, logger }: { all: boolean; logger: Logger }) {
	let jobs = 0
	if (pending.size === 0) return { jobs, stalled: false }

	logger.info({ pending: pending.size }, '⏳ Esperando a IA: cada post que não vira vaga abre lugar para mais um')
	let lastProgress = Date.now()

	while (pending.size > 0) {
		await Bun.sleep(OUTCOME_POLL_MS)

		const before = pending.size
		jobs += await settleOutcomes(pending)

		if (pending.size < before) {
			if (!all) break
			lastProgress = Date.now()
		} else if (Date.now() - lastProgress >= OUTCOME_STALL_MS) {
			logger.warn(
				{ pending: pending.size },
				'A IA não terminou os posts enviados a tempo: eles contam como vagas e a busca do termo para',
			)
			jobs += pending.size
			pending.clear()
			return { jobs, stalled: true }
		}
	}

	return { jobs, stalled: false }
}

/**
 * Tira de `seen_posts` as listas de vagas entre os posts enviados, para elas aparecerem de novo em outra busca. As
 * vagas delas já pedidas ao scraper não são abertas: o pedido de uma lista que não está mais em `seen_posts` é
 * ignorado (ver `JobLookupWorker`).
 * @returns Os ids das listas.
 */
async function deferLists(postIds: string[]) {
	if (postIds.length === 0) return []

	const lists = await SeenPost.find({ postId: { $in: postIds }, outcome: 'multi-job' }, { postId: 1 }).lean()
	const ids = lists.map(list => list.postId)
	if (ids.length > 0) await SeenPost.deleteMany({ postId: { $in: ids }, outcome: 'multi-job' })

	return ids
}

/** Registra o post como visto, para as próximas coletas o pularem como fariam com um descartado pelo post-processing. */
function markAsOtherLanguage(postId: string, reason: string) {
	return SeenPost.updateOne({ postId }, { $setOnInsert: { postId, isJob: false, outcome: 'language', reason } }, { upsert: true })
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
		authorIsCompany: post.authorIsCompany,
		authorHeadline: post.authorHeadline,
		postedAt: postedAtFromUrn(urn),
		scrapedAt: new Date().toISOString(),
		sourcePostId: null,
		jobLink: null,
		attachedLink: externalLink(post.cardLinks),
		images: [],
		reprocessId: null,
	}
}

/** Pausa por um tempo aleatório, para não ter ritmo de robô. */
export function humanPause() {
	return Bun.sleep(1_500 + Math.random() * 2_500)
}
