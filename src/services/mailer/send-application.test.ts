import { beforeEach, describe, expect, test } from 'bun:test'

import type { MailRequest, MailResult } from '@shared/contracts'
import { createLogger } from '@shared/logging'
import { PermanentError } from '@shared/messaging'

import type { OutgoingMail } from './mail-transport'
import { MISSING_FILE_ERROR, NO_ACCOUNT_ERROR, sendApplication, type SendDeps } from './send-application'

const logger = createLogger('test')

const request: MailRequest = {
	mailId: 'mail-1',
	postId: 'post-1',
	to: 'rh@acme.com.br',
	subject: 'Candidatura – Desenvolvedor Vue',
	body: 'Olá!\n\nEnvio meu currículo em anexo.',
	attachment: { fileId: 'file-1' },
	requestedBy: 'web',
	replyTo: { queue: 'web-mail', context: { mailId: 'mail-1' } },
	requestedAt: new Date().toISOString(),
}

const firstTry = { retries: 0, finalAttempt: false }
const lastTry = { retries: 3, finalAttempt: true }

/** Tudo em memória: o provedor simulado só guarda o que "enviou" (ou lança o erro pedido). */
function setup({ sendError, status = 'sending' }: { sendError?: unknown; status?: 'sending' | 'sent' | 'failed' | null } = {}) {
	const sent: OutgoingMail[] = []
	const replies: { queue: string; result: MailResult }[] = []
	const record = { status, error: null as string | null, retries: 0 }
	const applied: string[] = []
	let account = true
	let file = true

	const deps: SendDeps = {
		account: async () =>
			account
				? {
						from: 'Ana <ana@gmail.com>',
						transport: {
							send: async mail => {
								if (sendError) throw sendError
								sent.push(mail)
							},
							verify: async () => {},
						},
					}
				: null,
		records: {
			status: async () => record.status,
			markSent: async () => {
				record.status = 'sent'
			},
			markFailed: async (_, error) => {
				record.status = 'failed'
				record.error = error
			},
			noteRetry: async (_, error) => {
				record.error = error
				record.retries++
			},
		},
		findFile: async () => (file ? { fileName: 'Curriculo.pdf', pdf: Buffer.from('%PDF') } : null),
		reply: async (queue, result) => {
			replies.push({ queue, result })
		},
		markApplied: async postId => {
			applied.push(postId)
		},
		logger,
	}

	return {
		deps,
		sent,
		replies,
		record,
		applied,
		withoutAccount: () => {
			account = false
		},
		withoutFile: () => {
			file = false
		},
	}
}

const smtpError = (code: string, responseCode?: number) => Object.assign(new Error('smtp'), { code, responseCode })

describe('sendApplication', () => {
	let ctx: ReturnType<typeof setup>
	beforeEach(() => {
		ctx = setup()
	})

	test('envia com o PDF anexado, marca a candidatura e responde na fila de quem pediu, com o contexto', async () => {
		await sendApplication(request, firstTry, ctx.deps)

		expect(ctx.sent).toHaveLength(1)
		expect(ctx.sent[0]?.to).toBe('rh@acme.com.br')
		expect(ctx.sent[0]?.from).toBe('Ana <ana@gmail.com>')
		expect(ctx.sent[0]?.attachments[0]?.filename).toBe('Curriculo.pdf')
		expect(ctx.record.status).toBe('sent')
		expect(ctx.applied).toEqual(['post-1'])
		expect(ctx.replies).toHaveLength(1)
		expect(ctx.replies[0]?.queue).toBe('web-mail')
		expect(ctx.replies[0]?.result).toMatchObject({
			mailId: 'mail-1',
			postId: 'post-1',
			context: { mailId: 'mail-1' },
			status: 'sent',
			error: null,
		})
	})

	test('a mesma mensagem entregue de novo depois do envio não manda outro e-mail', async () => {
		ctx = setup({ status: 'sent' })
		await sendApplication(request, firstTry, ctx.deps)

		expect(ctx.sent).toHaveLength(0)
		expect(ctx.replies[0]?.result.status).toBe('sent')
	})

	test('sem registro (sem confirmação de quem clicou), não envia nada', async () => {
		ctx = setup({ status: null })
		await sendApplication(request, firstTry, ctx.deps)

		expect(ctx.sent).toHaveLength(0)
		expect(ctx.replies).toHaveLength(0)
	})

	test('sem conta de e-mail, falha na hora dizendo o que configurar', async () => {
		ctx.withoutAccount()
		await sendApplication(request, firstTry, ctx.deps)

		expect(ctx.record).toMatchObject({ status: 'failed', error: NO_ACCOUNT_ERROR })
		expect(ctx.replies[0]?.result).toMatchObject({ status: 'failed', error: NO_ACCOUNT_ERROR, sentAt: null })
	})

	test('sem o PDF (expirou), falha pedindo para gerar de novo', async () => {
		ctx.withoutFile()
		await sendApplication(request, firstTry, ctx.deps)

		expect(ctx.sent).toHaveLength(0)
		expect(ctx.replies[0]?.result.error).toBe(MISSING_FILE_ERROR)
	})

	test('erro transitório volta para a fila sem avisar o canal (o envio continua "enviando")', async () => {
		ctx = setup({ sendError: smtpError('ETIMEDOUT') })
		const attempt = sendApplication(request, firstTry, ctx.deps)

		await expect(attempt).rejects.toThrow('Não consegui falar com o servidor SMTP')
		await expect(attempt).rejects.not.toBeInstanceOf(PermanentError)
		expect(ctx.record).toMatchObject({ status: 'sending', retries: 1 })
		expect(ctx.replies).toHaveLength(0)
	})

	test('erro transitório na última tentativa vira falha e vai para a DLQ', async () => {
		ctx = setup({ sendError: smtpError('ECONNECTION') })

		await expect(sendApplication(request, lastTry, ctx.deps)).rejects.toBeInstanceOf(PermanentError)
		expect(ctx.record.status).toBe('failed')
		expect(ctx.replies[0]?.result.status).toBe('failed')
	})

	test('endereço recusado vai direto para a DLQ e aparece como falha, com o motivo', async () => {
		ctx = setup({ sendError: smtpError('EENVELOPE', 550) })

		await expect(sendApplication(request, firstTry, ctx.deps)).rejects.toBeInstanceOf(PermanentError)
		expect(ctx.record.status).toBe('failed')
		expect(ctx.replies[0]?.result.error).toContain('recusou o endereço do destinatário')
		expect(ctx.applied).toEqual([])
	})

	test('login recusado também vai direto para a DLQ', async () => {
		ctx = setup({ sendError: smtpError('EAUTH', 535) })

		await expect(sendApplication(request, firstTry, ctx.deps)).rejects.toBeInstanceOf(PermanentError)
		expect(ctx.replies[0]?.result.error).toContain('recusou o login')
	})
})
