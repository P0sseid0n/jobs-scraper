import type { ElementHandle, Page } from 'puppeteer'

import { SELECTORS } from './linkedin/selectors'
import { decodeQrFromPng } from './linkedin/verification-qr'

/** Verificação que o LinkedIn pediu no login (página /checkpoint). */
export type Challenge =
	/** Código enviado por e-mail, SMS ou app autenticador. */
	| { kind: 'code'; input: ElementHandle<Element> }
	| { kind: 'qr'; content: string }
	| { kind: 'captcha' }
	/** Pedido de aprovação enviado ao app do LinkedIn no celular: basta esperar. */
	| { kind: 'app-approval' }
	/** Página ainda carregando ou um layout que os seletores não reconhecem. */
	| { kind: 'unknown' }

// Textos da página de aprovação pelo app (pt e en); o código e o QR são checados antes, então menções ao app neles não contam
const APP_APPROVAL_TEXT = /(app|aplicativo) (do )?linkedin|linkedin app|notifica(ção|cao|tion)/i

/** Diz se o texto da página de verificação pede para aprovar o acesso no app do LinkedIn. */
export function looksLikeAppApproval(pageText: string) {
	return APP_APPROVAL_TEXT.test(pageText)
}

export async function detectChallenge(page: Page): Promise<Challenge> {
	const input = await findVisible(page, SELECTORS.verificationCodeInput)
	if (input) return { kind: 'code', input }

	const qr = decodeQrFromPng(await page.screenshot({ type: 'png' }))
	if (qr) return { kind: 'qr', content: qr }

	if (await findVisible(page, SELECTORS.captchaFrame)) return { kind: 'captcha' }

	if (looksLikeAppApproval(await page.evaluate(() => document.body?.innerText ?? ''))) return { kind: 'app-approval' }

	return { kind: 'unknown' }
}

/** Primeiro elemento *visível* do seletor, sem esperar (a página de login tem cópias ocultas dos campos). */
export async function findVisible(page: Page, selector: string) {
	const handle = await page.evaluateHandle(
		(sel: string) =>
			Array.from(document.querySelectorAll(sel)).find(el => {
				const rect = el.getBoundingClientRect()
				return rect.width > 0 && rect.height > 0
			}) ?? null,
		selector,
	)

	const element = handle.asElement() as ElementHandle<Element> | null
	if (!element) await handle.dispose()

	return element
}
