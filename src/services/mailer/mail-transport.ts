import nodemailer from 'nodemailer'

import { SMTP_DEFAULT_PORT, type CredentialsOf } from '@shared/contracts'

/** O e-mail pronto para o provedor. */
export type OutgoingMail = {
	from: string
	to: string
	subject: string
	text: string
	attachments: { filename: string; content: Buffer; contentType: string }[]
}

/**
 * O provedor de envio. O mailer só conhece esta interface: hoje é o SMTP, e dá para trocar por uma API (Resend, SES)
 * sem mexer no resto. Os erros saem como o provedor os lança; `classifyMailError` decide entre retry e DLQ.
 */
export interface MailTransport {
	send(mail: OutgoingMail): Promise<void>
	/** Conecta e autentica sem enviar nada (o "testar" do site). */
	verify(): Promise<void>
}

export type SmtpAccount = CredentialsOf<'smtp'>

// Sem limite, um servidor que não responde seguraria a mensagem por minutos
const CONNECTION_TIMEOUT_MS = 15_000
const SOCKET_TIMEOUT_MS = 30_000

/** O remetente: o `from` da conta ou, sem ele, o usuário. */
export function senderOf(account: SmtpAccount) {
	return account.from ?? account.user
}

/** As opções do nodemailer para a conta: TLS desde a conexão na 465, STARTTLS nas outras. */
export function smtpOptions(account: SmtpAccount) {
	const port = account.port ? Number(account.port) : SMTP_DEFAULT_PORT

	return {
		host: account.host,
		port,
		secure: port === 465,
		auth: { user: account.user, pass: account.password },
		connectionTimeout: CONNECTION_TIMEOUT_MS,
		greetingTimeout: CONNECTION_TIMEOUT_MS,
		socketTimeout: SOCKET_TIMEOUT_MS,
	}
}

/** O provedor SMTP da conta (Gmail, Outlook e afins, com senha de app). */
export function createSmtpTransport(account: SmtpAccount): MailTransport {
	const transporter = nodemailer.createTransport(smtpOptions(account))

	return {
		send: async mail => {
			await transporter.sendMail(mail)
		},
		verify: async () => {
			await transporter.verify()
		},
	}
}
