import mongoose, { Schema } from 'mongoose'

/**
 * `pending`: o site pediu um teste e o scraper ainda não começou; `running`: fazendo login; `verification`: o LinkedIn
 * pediu uma verificação (`challenge`); `success` e `failed`: o último login terminou.
 */
export const LINKEDIN_LOGIN_STATUSES = ['pending', 'running', 'verification', 'success', 'failed'] as const
export type LinkedinLoginStatus = (typeof LINKEDIN_LOGIN_STATUSES)[number]

/** A verificação que o site consegue mostrar: o código (e-mail, SMS ou app), o QR code ou a aprovação no app. */
export const LINKEDIN_CHALLENGES = ['code', 'qr', 'app-approval'] as const
export type LinkedinChallenge = (typeof LINKEDIN_CHALLENGES)[number]

export type LinkedinLoginDocument = {
	_id: 'linkedin'
	status: LinkedinLoginStatus
	challenge: LinkedinChallenge | null
	/** O conteúdo do QR code da verificação, para o site desenhar; `null` fora dela. */
	qr: string | null
	/** O resultado (sucesso ou o motivo da falha), para mostrar no site. */
	message: string | null
	/** Quando o site pediu o teste de login; `null` nos logins das coletas. */
	requestedAt: Date | null
	updatedAt: Date
}

/**
 * O login do LinkedIn em andamento ou o último, num documento só: o scraper grava cada passo (nas coletas e nos testes
 * pedidos pelo site), e o site mostra a verificação na tela, em vez de só no terminal.
 */
const linkedinLoginSchema = new Schema<LinkedinLoginDocument>(
	{
		_id: { type: String, required: true },
		status: { type: String, enum: LINKEDIN_LOGIN_STATUSES, required: true },
		challenge: { type: String, enum: [...LINKEDIN_CHALLENGES, null], default: null },
		qr: { type: String, default: null },
		message: { type: String, default: null },
		requestedAt: { type: Date, default: null },
		updatedAt: { type: Date, required: true },
	},
	{ versionKey: false },
)

export const LinkedinLogin = mongoose.model('LinkedinLogin', linkedinLoginSchema, 'linkedin_login')

export type LinkedinLoginUpdate = Partial<Omit<LinkedinLoginDocument, '_id' | 'updatedAt'>> & { status: LinkedinLoginStatus }

/** Grava o passo do login; os campos não enviados ficam como estão (o `challenge` e o `qr` saem fora da verificação). */
export async function reportLinkedinLogin(update: LinkedinLoginUpdate) {
	const cleared = update.status === 'verification' ? {} : { challenge: null, qr: null }

	await LinkedinLogin.updateOne(
		{ _id: 'linkedin' },
		{ $set: { message: null, ...cleared, ...update, updatedAt: new Date() } },
		{ upsert: true },
	)
}

export function readLinkedinLogin() {
	return LinkedinLogin.findById('linkedin').lean<LinkedinLoginDocument>()
}
