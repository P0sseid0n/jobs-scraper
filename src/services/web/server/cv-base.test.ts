import { expect, test } from 'bun:test'

import { CV_BASE_TIMEOUT_ERROR, toWebCvBaseVersion } from './cv-base'
import { CV_TIMEOUT_MS } from './cv-request.model'

const createdAt = new Date('2026-10-22T12:00:00.000Z')
const doc = {
	versionId: 'v1',
	size: 9000,
	fileName: 'cv.tex',
	status: 'validating' as const,
	problems: [],
	pages: null,
	createdAt,
	validatedAt: null,
	activatedAt: null,
	expiresAt: new Date('2026-10-29T12:00:00.000Z'),
}

test('versão validando dentro do prazo continua validando', () => {
	expect(toWebCvBaseVersion(doc, new Date(createdAt.getTime() + 60_000)).status).toBe('validating')
})

test('sem resposta do cv-updater no prazo, aparece como recusada com o motivo', () => {
	const version = toWebCvBaseVersion(doc, new Date(createdAt.getTime() + CV_TIMEOUT_MS + 1))

	expect(version).toMatchObject({ status: 'invalid', errors: [CV_BASE_TIMEOUT_ERROR], createdAt: createdAt.toISOString() })
})

test('os problemas da validação vão como erros da versão', () => {
	const version = toWebCvBaseVersion({ ...doc, status: 'invalid', problems: ['Falta a seção \\section*{Projetos}.'] })

	expect(version.errors).toEqual(['Falta a seção \\section*{Projetos}.'])
})
