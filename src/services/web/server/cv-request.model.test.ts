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
