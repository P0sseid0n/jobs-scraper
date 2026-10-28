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
 * - autenticação recusada (`EAUTH`, 530/534/535) é permanente: tentar de novo não muda a senha;
 * - resposta 5xx do servidor (endereço recusado, mensagem rejeitada) é permanente;
 * - resposta 4xx (caixa cheia, limite por minuto, servidor ocupado) e erros de rede são transitórios;
 * - o que não dá para reconhecer conta como transitório: as tentativas acabam e ele vira falha do mesmo jeito.
 */
export function classifyMailError(error: unknown): ClassifiedMailError {
	const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown }
	const smtp = typeof responseCode === 'number' ? responseCode : null

	if (code === 'EAUTH' || smtp === 530 || smtp === 534 || smtp === 535) {
		return {
			kind: 'permanent',
			reason: 'O servidor SMTP recusou o login: confira o usuário e a senha (de app, no Gmail e no Outlook) da conta de e-mail.',
		}
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
