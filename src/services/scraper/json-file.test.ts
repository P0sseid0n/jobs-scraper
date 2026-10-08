import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'bun:test'

import { loadJson, saveJson } from './json-file'

describe('files', () => {
	test('loadJson retorna o fallback quando o arquivo não existe', async () => {
		expect(await loadJson(path.join(tmpdir(), `nao-existe-${Date.now()}.json`), [])).toEqual([])
	})

	test('saveJson cria diretórios que faltam', async () => {
		const file = path.join(tmpdir(), `jobs-scraper-${Date.now()}`, 'sub', 'data.json')
		await saveJson(file, { ok: true })
		expect(await loadJson(file, null)).toEqual({ ok: true })
	})
})
