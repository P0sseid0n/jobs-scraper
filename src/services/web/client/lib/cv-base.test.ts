import { expect, test } from 'bun:test'

import type { WebCvBaseVersion } from '../../api-types'
import { activeVersion, formatKilobytes, texBytes, upsertVersion } from './cv-base'

const version = (versionId: string, createdAt: string, activatedAt: string | null = null): WebCvBaseVersion => ({
	versionId,
	fileName: null,
	status: 'valid',
	errors: [],
	pages: 1,
	size: 1000,
	createdAt,
	validatedAt: createdAt,
	activatedAt,
	expiresAt: null,
})

test('a versão ativa é a ativada por último, mesmo que seja mais antiga (voltar a uma anterior)', () => {
	const versions = [
		version('nova', '2026-10-20T10:00:00.000Z', '2026-10-20T10:05:00.000Z'),
		version('antiga', '2026-10-01T10:00:00.000Z', '2026-10-21T08:00:00.000Z'),
		version('nunca-ativada', '2026-10-21T09:00:00.000Z'),
	]

	expect(activeVersion(versions)?.versionId).toBe('antiga')
	expect(activeVersion([version('nunca-ativada', '2026-10-21T09:00:00.000Z')])).toBeNull()
})

test('a versão atualizada troca a anterior e a lista fica das mais novas às mais antigas', () => {
	const versions = [version('b', '2026-10-02T00:00:00.000Z'), version('a', '2026-10-01T00:00:00.000Z')]

	const updated = upsertVersion(versions, { ...version('a', '2026-10-01T00:00:00.000Z'), pages: 2 })
	expect(updated.map(item => [item.versionId, item.pages])).toEqual([
		['b', 1],
		['a', 2],
	])
	expect(upsertVersion(versions, version('c', '2026-10-03T00:00:00.000Z'))[0]?.versionId).toBe('c')
})

test('o tamanho conta bytes em UTF-8, como o limite do servidor', () => {
	expect(texBytes('Experiência')).toBe(12)
	expect(formatKilobytes(12_595)).toBe('12,3 KB')
})
