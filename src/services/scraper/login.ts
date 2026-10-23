import path from 'node:path'
import type { ElementHandle, Page } from 'puppeteer'

import type { CredentialsOf } from '@shared/contracts'
import { reportLinkedinLogin, type LinkedinLoginUpdate, type ScraperLoginFailure } from '@shared/database'
import type { Logger } from '@shared/logging'

import type { BrowserSession } from './browser-session'
import type { HeadlessMode, ScraperConfig } from './config'
import { canOpenWindow } from './display'
import { SELECTORS } from './linkedin/selectors'
import { isAuthPage, isCheckpointPage, LOGIN_URL } from './linkedin/urls'
import { renderQrForTerminal } from './linkedin/verification-qr'
import { detectChallenge } from './verification'
import { closeVerificationInbox, openVerificationInbox, takeVerificationCode } from './verification-inbox'

type LoginOptions = {
	email: string
	password: string

	/** Ver `HEADLESS` em config.ts: com `auto`, a janela só é aberta para uma verificação que o terminal não resolve. */
	headlessMode: HeadlessMode

	/** Onde salvar o screenshot de uma verificação que o scraper não reconheceu ou não conseguiu resolver. */
	screenshotFile: string

	logger: Logger
}

/** A coleta não começa sem a conta: sem ela, o login (e a coleta inteira) falharia de qualquer forma. */
export const NO_LINKEDIN_ACCOUNT =
	'Sem conta do LinkedIn: informe o e-mail e a senha em Configurações › Contas (ou LINKEDIN_EMAIL e LINKEDIN_PASSWORD no .env)'

/** As opções do login a partir da conta e do .env (o screenshot da verificação fica ao lado do arquivo de cookies). */
export function loginOptionsFrom(config: ScraperConfig, account: CredentialsOf<'linkedin'>, logger: Logger): LoginOptions {
	return {
		email: account.email,
		password: account.password,
		headlessMode: config.HEADLESS,
		screenshotFile: path.join(path.dirname(config.LINKEDIN_COOKIES_FILE), 'login-verification.png'),
		logger,
	}
}

const LOGIN_TIMEOUT_MS = 30_000
const VERIFICATION_TIMEOUT_MS = 180_000
const POLL_MS = 2_000

/** Tempo numa verificação não reconhecida antes de avisar: logo após o redirecionamento, a página ainda está carregando. */
const UNKNOWN_CHALLENGE_GRACE_MS = 6_000

/**
 * Tempo numa verificação não reconhecida antes de abrir a janela. Pode ser uma aprovação pelo app com texto diferente:
 * abrir a janela refaz o login e manda outro pedido ao celular, então primeiro dá tempo para aprovar o atual.
 */
const UNKNOWN_CHALLENGE_WINDOW_DELAY_MS = 60_000

/**
 * O login não foi concluído: a coleta inteira para, porque tentar de novo a cada termo aumentaria o risco de bloqueio.
 * O `kind` vai para o histórico, e o site explica a falha sem os detalhes técnicos da mensagem.
 */
export class LoginError extends Error {
	constructor(
		message: string,
		readonly kind: ScraperLoginFailure = 'other',
	) {
		super(message)
	}
}

/** A verificação pedida só pode ser resolvida na janela do navegador (ex.: captcha). */
class NeedsWindowError extends Error {
	constructor(
		challenge: string,
		/** Página da verificação, para identificar o tipo depois (junto com o screenshot). */
		readonly url: string,
	) {
		super(challenge)
	}
}

/**
 * Garante que a página atual está logada, fazendo login se preciso. Se o LinkedIn pedir verificação sem janela,
 * resolve pelo terminal (QR code, código, aprovação no app) ou, com `HEADLESS=auto` e tela disponível, abre a janela.
 * @returns `true` se fez login (o chamador deve voltar à página que queria abrir).
 */
export async function ensureLoggedIn(session: BrowserSession, options: LoginOptions): Promise<boolean> {
	const { logger } = options
	const page = session.page

	// Sempre relê a URL atual: ela muda depois de cada navegação/redirecionamento
	const hasLoginForm = (await page.$(SELECTORS.loginUsername)) !== null
	if (!isAuthPage(page.url()) && !hasLoginForm) return false

	logger.info({ url: page.url() }, '⚠️ Login necessário')
	await report({ status: 'running' }, logger)

	try {
		await logInOrOpenWindow(session, options)
	} catch (error) {
		await report({ status: 'failed', message: error instanceof Error ? error.message : String(error) }, logger)
		throw error
	}

	// Espera os redirecionamentos pós-login terminarem para a próxima navegação não ser abortada
	await session.page.waitForNetworkIdle({ idleTime: 1_000, timeout: 15_000 }).catch(() => {})
	await session.saveCookies()

	logger.info({ url: session.page.url() }, '✅ Login realizado')
	await report({ status: 'success', message: 'Login feito no LinkedIn.' }, logger)

	// A janela só foi aberta para a verificação: com a sessão salva, o resto da coleta volta a ser sem janela
	if (options.headlessMode === 'auto' && !session.headless) {
		await session.relaunch({ headless: true })
	}

	return true
}

async function logInOrOpenWindow(session: BrowserSession, options: LoginOptions) {
	try {
		await logIn(session, options)
	} catch (error) {
		if (!(error instanceof NeedsWindowError)) throw error

		// Não dá para mostrar a janela do navegador headless: abre outro, com janela, e refaz o login nele
		options.logger.warn(
			{ challenge: error.message, url: error.url, screenshot: options.screenshotFile },
			'🪟 Verificação só pode ser resolvida na janela: abrindo o navegador',
		)
		await report(
			{
				status: 'running',
				message: 'O LinkedIn pediu uma verificação que só dá para resolver na janela do navegador, que foi aberta.',
			},
			options.logger,
		)
		await session.relaunch({ headless: false, withCookies: false })
		await logIn(session, options)
	}
}

/**
 * Grava o passo do login para o site mostrar (ex.: o QR code da verificação). Uma falha ao gravar não interrompe o
 * login: o terminal continua mostrando tudo.
 */
export async function report(update: LinkedinLoginUpdate, logger: Logger) {
	try {
		await reportLinkedinLogin(update)
	} catch (error) {
		logger.warn({ err: error }, 'Não consegui gravar o andamento do login para o site')
	}
}

async function logIn(session: BrowserSession, options: LoginOptions) {
	if (!(await session.page.$(SELECTORS.loginUsername))) await session.goto(LOGIN_URL)

	await submitLoginForm(session.page, options)
	if (!session.headless) options.logger.info('Se o LinkedIn pedir uma verificação, resolva na janela do navegador')

	await waitForSession(session, options)
}

async function submitLoginForm(page: Page, options: LoginOptions) {
	const usernameInput = await waitForVisible(page, SELECTORS.loginUsername)
	const passwordInput = await waitForVisible(page, SELECTORS.loginPassword)
	if (!usernameInput || !passwordInput) throw new LoginError(`Formulário de login não encontrado em ${page.url()}`)

	await usernameInput.type(options.email, { delay: 50 })
	await passwordInput.type(options.password, { delay: 50 })

	// Enter em vez de clicar no botão: não depende do texto do botão (idioma) nem de classes
	await passwordInput.press('Enter')
}

/** O que já foi feito na verificação em andamento, para não repetir avisos nem screenshots. */
type VerificationState = {
	/** Até quando a verificação é esperada, para o site mostrar quanto tempo falta. */
	expiresAt: Date
	lastQr: string | null
	codeRequested: boolean
	appApprovalRequested: boolean
	unknownSince: number | null
	unknownAnnounced: boolean
	screenshotSaved: boolean
}

/**
 * Espera o login terminar: cookie de sessão gravado e fora das páginas de autenticação (a URL muda antes do `li_at`).
 * Sem janela, trata a verificação do LinkedIn quando ela aparece.
 */
async function waitForSession(session: BrowserSession, options: LoginOptions) {
	let deadline = Date.now() + (session.headless ? LOGIN_TIMEOUT_MS : VERIFICATION_TIMEOUT_MS)
	let verification: VerificationState | undefined

	openVerificationInbox()

	try {
		while (!(await session.hasSession()) || isAuthPage(session.page.url())) {
			if (session.headless && isCheckpointPage(session.page.url())) {
				if (!verification) {
					// Resolver a verificação depende de alguém agir (escanear, digitar o código): mais tempo
					deadline = Date.now() + VERIFICATION_TIMEOUT_MS
					verification = {
						expiresAt: new Date(deadline),
						lastQr: null,
						codeRequested: false,
						appApprovalRequested: false,
						unknownSince: null,
						unknownAnnounced: false,
						screenshotSaved: false,
					}
				}

				try {
					await handleChallenge(session, verification, options)
				} catch (error) {
					// A página navegou no meio da checagem (ex.: o acesso foi aprovado no app): checa de novo na próxima volta
					if (!isNavigationError(error)) throw error
				}
			}

			if (Date.now() > deadline) throw await loginTimeoutError(session, verification, options)

			await Bun.sleep(POLL_MS)
		}
	} finally {
		closeVerificationInbox()
	}
}

function isNavigationError(error: unknown) {
	return error instanceof Error && /Execution context was destroyed|detached Frame|Cannot find context/i.test(error.message)
}

/** Trata a verificação mostrada agora: QR no terminal, código pela fila, janela ou screenshot. */
async function handleChallenge(session: BrowserSession, state: VerificationState, options: LoginOptions) {
	const { logger, screenshotFile } = options
	const windowAllowed = options.headlessMode === 'auto' && canOpenWindow()
	const challenge = await detectChallenge(session.page)

	if (challenge.kind !== 'unknown') state.unknownSince = null

	switch (challenge.kind) {
		case 'qr': {
			// O QR pode ser renovado pelo LinkedIn: desenha de novo quando muda
			if (challenge.content === state.lastQr) return
			state.lastQr = challenge.content

			logger.warn('📱 O LinkedIn pediu verificação por QR code: escaneie o código abaixo com o app do LinkedIn')
			process.stdout.write(`\n${await renderQrForTerminal(challenge.content)}\n`)
			await report({ status: 'verification', challenge: 'qr', qr: challenge.content, expiresAt: state.expiresAt }, logger)
			return
		}

		case 'code': {
			if (!state.codeRequested) {
				state.codeRequested = true
				logger.warn(
					'🔢 O LinkedIn pediu o código de verificação (e-mail, SMS ou app autenticador). Envie pelo site ou com: bun scraper:verify <código>',
				)
				await report({ status: 'verification', challenge: 'code', expiresAt: state.expiresAt }, logger)
			}

			const code = takeVerificationCode()
			if (!code) return

			await challenge.input.click({ count: 3 })
			await challenge.input.type(code, { delay: 80 })
			await challenge.input.press('Enter')
			logger.info('Código de verificação enviado; se o LinkedIn recusar, envie outro')
			await report(
				{
					status: 'verification',
					challenge: 'code',
					message: 'Código enviado ao LinkedIn. Se ele recusar, mande outro.',
					expiresAt: state.expiresAt,
				},
				logger,
			)
			return
		}

		case 'app-approval': {
			if (state.appApprovalRequested) return
			state.appApprovalRequested = true

			logger.warn('📱 O LinkedIn enviou um pedido de acesso para o app do LinkedIn: aprove no celular')
			await report({ status: 'verification', challenge: 'app-approval', expiresAt: state.expiresAt }, logger)
			return
		}

		case 'captcha': {
			// O screenshot fica salvo mesmo quando a janela resolve: ajuda a reconhecer a verificação da próxima vez
			await saveScreenshot(session, state, options)
			if (windowAllowed) throw new NeedsWindowError('captcha', session.page.url())

			throw new LoginError(
				`O LinkedIn pediu um captcha, que só dá para resolver na janela do navegador: rode com HEADLESS=auto numa máquina com tela (fora do Docker) ou atualize o cookie li_at (Configurações › Contas ou LINKEDIN_LI_AT no .env). Screenshot: ${screenshotFile}`,
				'captcha',
			)
		}

		case 'unknown': {
			state.unknownSince ??= Date.now()
			const elapsed = Date.now() - state.unknownSince
			if (elapsed < UNKNOWN_CHALLENGE_GRACE_MS) return

			if (!state.unknownAnnounced) {
				state.unknownAnnounced = true
				await saveScreenshot(session, state, options)
				logger.warn(
					{ screenshot: screenshotFile, url: session.page.url() },
					windowAllowed
						? '❓ Verificação não reconhecida. Se chegou um pedido no app do LinkedIn, aprove no celular; senão, a janela do navegador abre em 1 minuto'
						: '❓ Verificação não reconhecida. Se chegou um pedido no app do LinkedIn, aprove no celular; senão, veja o screenshot',
				)
			}

			if (windowAllowed && elapsed >= UNKNOWN_CHALLENGE_WINDOW_DELAY_MS) {
				throw new NeedsWindowError('verificação não reconhecida', session.page.url())
			}
		}
	}
}

async function saveScreenshot(session: BrowserSession, state: VerificationState, { screenshotFile, logger }: LoginOptions) {
	try {
		await session.saveScreenshot(screenshotFile)
		state.screenshotSaved = true
	} catch (error) {
		logger.warn({ err: error }, 'Não foi possível salvar o screenshot da verificação')
	}
}

async function loginTimeoutError(session: BrowserSession, verification: VerificationState | undefined, options: LoginOptions) {
	const url = session.page.url()

	if (!verification && !isCheckpointPage(url)) {
		return new LoginError(
			`Login não concluído (página atual: ${url}). Verifique o e-mail e a senha do LinkedIn (Configurações › Contas ou o .env).`,
			'credentials',
		)
	}

	if (!session.headless) {
		return new LoginError(`A verificação do LinkedIn não foi concluída na janela a tempo (página atual: ${url}).`, 'verification')
	}

	if (verification && !verification.screenshotSaved) await saveScreenshot(session, verification, options)

	return new LoginError(
		`A verificação do LinkedIn não foi concluída a tempo (página atual: ${url}). Veja o screenshot em ${options.screenshotFile}, rode com HEADLESS=auto numa máquina com tela ou atualize o cookie li_at (Configurações › Contas ou LINKEDIN_LI_AT no .env).`,
		'verification',
	)
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
