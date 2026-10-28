import { expect, test } from 'bun:test'

import { CV_TIMEOUT_ERROR, CV_TIMEOUT_MS, toWebCvRequest } from './cv-request.model'

const requestedAt = new Date('2026-10-10T12:00:00.000Z')
const doc = {
	requestId: 'r1',
	postId: 'p1',
	jobTitle: 'Dev',
	company: null,
	status: 'pending' as const,
	fileName: null,
	error: null,
	requestedAt,
	finishedAt: null,
}

test('pedido pendente dentro do prazo continua gerando', () => {
	expect(toWebCvRequest(doc, new Date(requestedAt.getTime() + 60_000)).status).toBe('pending')
})

test('sem resposta do cv-updater no prazo, aparece como falha com o motivo', () => {
	const result = toWebCvRequest(doc, new Date(requestedAt.getTime() + CV_TIMEOUT_MS + 1))

	expect(result).toMatchObject({ status: 'failed', error: CV_TIMEOUT_ERROR, requestedAt: requestedAt.toISOString() })
})

test('mensagem gerada pela IA vai junto; pedidos antigos, sem o campo, ficam sem mensagem', () => {
	const message = { subject: 'Candidatura – Dev', body: 'Olá! Tudo bem?', tone: 'casual', length: 'short' } as const

	expect(toWebCvRequest({ ...doc, status: 'ready', message }).message).toEqual(message)
	expect(toWebCvRequest(doc).message).toBeNull()
})

test('mensagem de antes do tom e do tamanho fica com eles em null; a versão anterior vai junto para desfazer', () => {
	const message = { subject: 'Candidatura – Dev', body: 'Olá! Tudo bem?' }
	const previousMessage = { ...message, tone: 'formal', length: 'medium' } as const
	const result = toWebCvRequest({ ...doc, status: 'ready', message, previousMessage })

	expect(result.message).toEqual({ ...message, tone: null, length: null })
	expect(result.previousMessage).toEqual(previousMessage)
	expect(toWebCvRequest(doc).previousMessage).toBeNull()
})

test('o ajuste feito para a vaga vai junto; pedidos antigos, sem o campo, ficam sem ele', () => {
	const changes = {
		addedSkills: ['Angular'],
		removedSkills: ['jQuery'],
		summary: { before: 'Antes.', after: 'Depois.' },
		projects: ['Painel'],
	}

	expect(toWebCvRequest({ ...doc, status: 'ready', changes }).changes).toEqual(changes)
	expect(toWebCvRequest(doc).changes).toBeNull()
})
