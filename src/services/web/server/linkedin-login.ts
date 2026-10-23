import QRCode from 'qrcode'

import { VerificationCodeSchema, type LoginTestRequest, type VerificationCode } from '@shared/contracts'
import { readLinkedinLogin, reportLinkedinLogin } from '@shared/database'
import { QUEUES, type QueueClient } from '@shared/messaging'
import { loadCredentials } from '@shared/settings'

import type { LinkedinLoginState } from '../api-types'
import { HttpError, readJson } from './http'

/** `GET /api/linkedin/login`: o login do LinkedIn em andamento ou o último, com o QR code da verificação já desenhado. */
export async function getLinkedinLogin() {
	const login = await readLinkedinLogin()
	if (!login) return Response.json(null)

	return Response.json({
		status: login.status,
		challenge: login.challenge,
		qrSvg: login.qr ? await QRCode.toString(login.qr, { type: 'svg', margin: 1 }) : null,
		message: login.message,
		expiresAt: login.expiresAt?.toISOString() ?? null,
		requestedAt: login.requestedAt?.toISOString() ?? null,
		updatedAt: login.updatedAt.toISOString(),
	} satisfies LinkedinLoginState)
}

/**
 * `POST /api/linkedin/login`: pede ao scraper para testar o login com a conta salva. O andamento (e a verificação,
 * se o LinkedIn pedir) aparece em `GET /api/linkedin/login`.
 */
export async function requestLinkedinLogin(queue: QueueClient) {
	if (!(await loadCredentials('linkedin'))) throw new HttpError(409, 'Salve o e-mail e a senha do LinkedIn antes de testar')

	const requestedAt = new Date()
	await reportLinkedinLogin({ status: 'pending', requestedAt })
	await queue.publish(QUEUES.scraperLoginTest, { requestedAt: requestedAt.toISOString() } satisfies LoginTestRequest)

	return getLinkedinLogin()
}

/** `POST /api/linkedin/verification-code`: entrega ao login em andamento o código que o LinkedIn mandou. */
export async function sendVerificationCode(req: Request, queue: QueueClient) {
	const body = (await readJson(req)) as { code?: unknown }
	const message = VerificationCodeSchema.parse({ code: body?.code, requestedAt: new Date().toISOString() })

	await queue.publish(QUEUES.scraperVerification, message satisfies VerificationCode)
	return Response.json({ sent: true })
}
