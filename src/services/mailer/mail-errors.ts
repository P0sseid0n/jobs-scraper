import { GMAIL_APP_PASSWORDS_URL } from '@shared/contracts'

/** O erro do provedor, já decidido: `transient` volta para a fila (retry); `permanent` vai para a DLQ e vira falha. */
export type MailErrorKind = 'transient' | 'permanent'

export type ClassifiedMailError = { kind: MailErrorKind; reason: string }

/** Códigos de rede do Node e do nodemailer: o servidor fora ou lento, vale tentar de novo. */
const TRANSIENT_CODES = new Set([
	'ETIMEDOUT',
	'ECONNECTION',
	'ECONNREFUSED',
	'ECONNRESET',
	'ESOCKET',
	'EDNS',
	'ENOTFOUND',
	'EAI_AGAIN',
	'EPIPE',
	'EHOSTUNREACH',
	'ENETUNREACH',
])

/**
 * Decide se a falha do envio é transitória ou permanente e diz o motivo para mostrar no canal (sem o endereço nem a
 * resposta crua do servidor, que podem ter dados pessoais):
 * - autenticação recusada (`EAUTH`, 530/534/535) é permanente: tentar de novo não muda a senha (`loginRefusedReason`);
 * - resposta 5xx do servidor (endereço recusado, mensagem rejeitada) é permanente;
 * - resposta 4xx (caixa cheia, limite por minuto, servidor ocupado) e erros de rede são transitórios;
 * - o que não dá para reconhecer conta como transitório: as tentativas acabam e ele vira falha do mesmo jeito.
 */
export function classifyMailError(error: unknown): ClassifiedMailError {
	const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown }
	const smtp = typeof responseCode === 'number' ? responseCode : null

	if (isLoginRefused(error)) {
		return { kind: 'permanent', reason: loginRefusedReason(error, smtp) }
	}

	if (code === 'EENVELOPE' && smtp === null) {
		return { kind: 'permanent', reason: 'O endereço do destinatário ou do remetente é inválido.' }
	}

	if (smtp !== null && smtp >= 500) {
		const recipient = smtp === 550 || smtp === 551 || smtp === 553 || code === 'EENVELOPE'
		return {
			kind: 'permanent',
			reason: recipient
				? `O servidor recusou o endereço do destinatário (SMTP ${smtp}). Confira o e-mail do recrutador.`
				: `O servidor de e-mail recusou a mensagem (SMTP ${smtp}).`,
		}
	}

	if (smtp !== null && smtp >= 400) {
		return { kind: 'transient', reason: `O servidor de e-mail pediu para tentar mais tarde (SMTP ${smtp}).` }
	}

	if (typeof code === 'string' && TRANSIENT_CODES.has(code)) {
		return { kind: 'transient', reason: 'Não consegui falar com o servidor SMTP (fora do ar ou sem resposta).' }
	}

	return { kind: 'transient', reason: 'Erro inesperado ao enviar o e-mail. Veja os logs do mailer.' }
}

/** O servidor recusou o usuário ou a senha (`EAUTH`, 530/534/535): tentar de novo não adianta. */
export function isLoginRefused(error: unknown) {
	const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown }
	return code === 'EAUTH' || responseCode === 530 || responseCode === 534 || responseCode === 535
}

/**
 * O motivo do login recusado, com o código SMTP e o estendido (`SMTP 535 5.7.8`) para a pessoa procurar, mas sem a
 * resposta crua do servidor (pode ter o endereço). Dois casos comuns ganham motivo próprio: a Microsoft, que não aceita
 * mais senha no SMTP das contas pessoais (`5.7.139`), e o Gmail recusando a senha normal (`5.7.8`).
 */
function loginRefusedReason(error: unknown, smtp: number | null) {
	const { response, message } = (error ?? {}) as { response?: unknown; message?: unknown }
	const text = [response, message].filter(part => typeof part === 'string').join(' ')
	const extended = text.match(/\b5\.\d{1,3}\.\d{1,3}\b/)?.[0] ?? null
	const codes = smtp === null ? '' : ` (SMTP ${smtp}${extended ? ` ${extended}` : ''})`

	if (extended === '5.7.139' || /basic authentication is disabled|SmtpClientAuthentication is disabled/i.test(text)) {
		return (
			`A Microsoft não aceita senha, nem senha de app, no SMTP das contas pessoais do Outlook, Hotmail e Live${codes}. ` +
			'Use uma conta do Gmail com senha de app; contas Microsoft 365 de trabalho ou escola funcionam se o administrador liberar o SMTP AUTH.'
		)
	}

	if (extended === '5.7.8' && /Username and Password not accepted|gsmtp/i.test(text)) {
		return `O Gmail recusou o login${codes}: ele só aceita senha de app aqui, não a senha normal da conta. Crie uma em ${GMAIL_APP_PASSWORDS_URL}.`
	}

	return `O servidor SMTP recusou o login${codes}: confira o usuário e a senha (de app, no Gmail) da conta de e-mail.`
}
