import { describe, expect, test } from 'bun:test'

import { buildExtractionMessages, EXTRACTION_OUTPUT_FORMAT } from './extraction-prompt'

describe('prompt', () => {
	test('schema de saída exige todos os campos', () => {
		expect(EXTRACTION_OUTPUT_FORMAT.type).toBe('object')
		expect(EXTRACTION_OUTPUT_FORMAT.required).toEqual(expect.arrayContaining(['postType', 'aiJobConfidence', 'title', 'company']))
	})

	test('instruções em system e o post por último', () => {
		const messages = buildExtractionMessages({ text: 'Vaga Vue', author: 'Ana' })
		expect(messages[0]?.role).toBe('system')
		expect(messages.at(-1)).toEqual({ role: 'user', content: 'Post author: Ana\nPost:\nVaga Vue' })
	})
})
