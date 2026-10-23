import type { Logger } from '@shared/logging'
import { loadCredentials } from '@shared/settings'

import { browserOptionsFrom, BrowserSession } from './browser-session'
import type { ScraperConfig } from './config'
import { BASE_URL, LOGIN_URL } from './linkedin/urls'
import { ensureLoggedIn, loginOptionsFrom, NO_LINKEDIN_ACCOUNT, report } from './login'

const FEED_URL = `${BASE_URL}/feed/`

/**
 * Testa a conta do LinkedIn pedida pelo site: abre o feed com a sessão salva e, se o LinkedIn pedir, faz o login (com a
 * verificação mostrada no site). Não é um login a mais: com a sessão salva aqui, a próxima coleta já entra logada.
 * O resultado fica no estado do login (`reportLinkedinLogin`), que o site lê.
 */
export async function testLinkedinLogin({ config, logger }: { config: ScraperConfig; logger: Logger }) {
	const account = (await loadCredentials('linkedin'))?.value
	if (!account) {
		await report({ status: 'failed', message: NO_LINKEDIN_ACCOUNT }, logger)
		return
	}

	logger.info('🔐 Testando o login do LinkedIn pedido pelo site')
	await report({ status: 'running' }, logger)

	let session: BrowserSession | undefined
	try {
		session = await BrowserSession.launch(browserOptionsFrom(config, account.liAt, logger))

		try {
			await session.page.goto(FEED_URL, { waitUntil: 'domcontentloaded' })
		} catch (error) {
			// Cookies inválidos podem causar loop de redirecionamento: recomeça sem eles e faz login
			logger.warn({ err: error }, '🚫 Falha ao abrir o feed, tentando de novo sem os cookies salvos')
			await session.newContext({ withCookies: false })
			await session.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
		}

		// Com login, o próprio `ensureLoggedIn` grava o sucesso ou a falha
		const loggedInNow = await ensureLoggedIn(session, loginOptionsFrom(config, account, logger))
		if (!loggedInNow) {
			await session.saveCookies()
			await report({ status: 'success', message: 'A sessão salva do LinkedIn continua valendo.' }, logger)
		}
	} catch (error) {
		logger.error({ err: error }, 'O teste do login do LinkedIn falhou')
		// `ensureLoggedIn` já gravou a falha do login; aqui ficam as outras (ex.: o navegador não abriu)
		await report({ status: 'failed', message: error instanceof Error ? error.message : String(error) }, logger)
	} finally {
		await session?.close()
	}
}
