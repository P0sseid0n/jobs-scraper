import type { ElementHandle, Page } from 'puppeteer'

import type { Logger } from '@shared/logging'

import type { BrowserSession } from './browser-session'
import { SELECTORS } from './linkedin/selectors'
import { isAuthPage, LOGIN_URL } from './linkedin/urls'

type LoginOptions = {
	email: string
	password: string

	/** Sem interface gráfica não há como resolver captcha/2FA manualmente, então o timeout é menor. */
	headless: boolean

	logger: Logger
}

const LOGIN_TIMEOUT_MS = 30_000
const MANUAL_VERIFICATION_TIMEOUT_MS = 180_000

/**
 * Garante que a página atual está logada, fazendo login se preciso.
 * @returns `true` se fez login (o chamador deve voltar à página que queria abrir).
 */
export async function ensureLoggedIn(session: BrowserSession, options: LoginOptions): Promise<boolean> {
	const { logger } = options
	const page = session.page

	// Sempre relê a URL atual: ela muda depois de cada navegação/redirecionamento
	const hasLoginForm = (await page.$(SELECTORS.loginUsername)) !== null
	if (!isAuthPage(page.url()) && !hasLoginForm) return false

	logger.info({ url: page.url() }, '⚠️ Login necessário')

	if (!hasLoginForm) await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })

	await submitLoginForm(page, options)
	if (!options.headless) logger.info('Se o LinkedIn pedir captcha/2FA, resolva na janela do navegador')

	await waitForSession(session, options.headless)

	// Espera os redirecionamentos pós-login terminarem para a próxima navegação não ser abortada
	await page.waitForNetworkIdle({ idleTime: 1_000, timeout: 15_000 }).catch(() => {})
	await session.saveCookies()

	logger.info({ url: page.url() }, '✅ Login realizado')
	return true
}

async function submitLoginForm(page: Page, options: LoginOptions) {
	const usernameInput = await waitForVisible(page, SELECTORS.loginUsername)
	const passwordInput = await waitForVisible(page, SELECTORS.loginPassword)
	if (!usernameInput || !passwordInput) throw new Error(`Formulário de login não encontrado em ${page.url()}`)

	await usernameInput.type(options.email, { delay: 50 })
	await passwordInput.type(options.password, { delay: 50 })

	// Enter em vez de clicar no botão: não depende do texto do botão (idioma) nem de classes
	await passwordInput.press('Enter')
}

/** Espera o login terminar: cookie de sessão gravado e fora das páginas de autenticação (a URL muda antes do `li_at`). */
async function waitForSession(session: BrowserSession, headless: boolean) {
	const deadline = Date.now() + (headless ? LOGIN_TIMEOUT_MS : MANUAL_VERIFICATION_TIMEOUT_MS)

	while (!(await session.hasSession()) || isAuthPage(session.page.url())) {
		if (Date.now() > deadline) {
			const url = session.page.url()
			const reason = url.includes('/checkpoint')
				? 'O LinkedIn pediu verificação (captcha/2FA): rode com HEADLESS=false para resolver manualmente ou atualize LINKEDIN_LI_AT.'
				: 'Verifique LINKEDIN_EMAIL e LINKEDIN_PASSWORD.'

			throw new Error(`Login não concluído (página atual: ${url}). ${reason}`)
		}

		await Bun.sleep(1_000)
	}
}

/**
 * Espera o primeiro elemento *visível* do seletor. `waitForSelector({ visible: true })` não serve: olha só
 * o primeiro, e a página de login tem uma cópia oculta do formulário.
 */
async function waitForVisible(page: Page, selector: string) {
	const handle = await page.waitForFunction(
		(sel: string) =>
			Array.from(document.querySelectorAll(sel)).find(el => {
				const rect = el.getBoundingClientRect()
				return rect.width > 0 && rect.height > 0
			}),
		{ timeout: LOGIN_TIMEOUT_MS },
		selector,
	)

	return handle.asElement() as ElementHandle<Element> | null
}
