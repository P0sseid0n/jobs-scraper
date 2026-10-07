import type { ElementHandle, Page } from 'puppeteer'
import type { Logger } from '../../utils/logger'
import type { BrowserManager } from './browser'
import { isAuthPage, LOGIN_URL, SELECTORS } from './linkedin'

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
 * Espera o primeiro elemento *visível* que casa com o seletor. O `waitForSelector({ visible: true })`
 * não serve aqui: ele só olha o primeiro elemento do documento, e a página de login tem uma cópia
 * oculta (0×0) do formulário antes da visível.
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

/**
 * Garante que a página atual está logada. Retorna `true` se precisou fazer login
 * (o chamador deve voltar para a página que queria abrir).
 */
export async function ensureLoggedIn(manager: BrowserManager, opts: LoginOptions): Promise<boolean> {
	const { logger } = opts
	let page = manager.page

	// Sempre relê a URL atual: ela muda depois de cada navegação/redirecionamento
	const onAuthPage = isAuthPage(page.url())
	const hasLoginForm = (await page.$(SELECTORS.loginUsername)) !== null
	if (!onAuthPage && !hasLoginForm) return false

	logger.info({ url: page.url() }, '⚠️ Login necessário')

	if (!hasLoginForm) {
		await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
		page = manager.page
	}

	const usernameInput = await waitForVisible(page, SELECTORS.loginUsername)
	const passwordInput = await waitForVisible(page, SELECTORS.loginPassword)
	if (!usernameInput || !passwordInput) throw new Error(`Formulário de login não encontrado em ${page.url()}`)

	await usernameInput.type(opts.email, { delay: 50 })
	await passwordInput.type(opts.password, { delay: 50 })
	// Enter em vez de clicar no botão: não depende do texto do botão (idioma) nem de classes
	await passwordInput.press('Enter')

	if (!opts.headless) logger.info('Se o LinkedIn pedir captcha/2FA, resolva na janela do navegador')

	// Login só está concluído quando o cookie de sessão existe E saímos das páginas de autenticação.
	// Só a URL não basta: ela muda antes de o LinkedIn gravar o li_at e terminar os redirecionamentos.
	const deadline = Date.now() + (opts.headless ? LOGIN_TIMEOUT_MS : MANUAL_VERIFICATION_TIMEOUT_MS)
	while (!(await manager.hasSession()) || isAuthPage(page.url())) {
		if (Date.now() > deadline) {
			const reason = page.url().includes('/checkpoint')
				? 'O LinkedIn pediu verificação (captcha/2FA): rode com HEADLESS=false para resolver manualmente ou atualize LINKEDIN_LI_AT.'
				: 'Verifique LINKEDIN_EMAIL e LINKEDIN_PASSWORD.'
			throw new Error(`Login não concluído (página atual: ${page.url()}). ${reason}`)
		}
		await Bun.sleep(1_000)
	}

	// Espera os redirecionamentos pós-login terminarem para a próxima navegação não ser abortada
	await page.waitForNetworkIdle({ idleTime: 1_000, timeout: 15_000 }).catch(() => {})

	await manager.saveCookies()
	logger.info({ url: page.url() }, '✅ Login realizado')
	return true
}
