import { describe, expect, test } from 'bun:test'

import { parseLanguage } from './post-language'

describe('parseLanguage', () => {
	test('código ISO 639-1, sem a região', () => {
		expect(parseLanguage('{"language": "en"}')).toBe('en')
		expect(parseLanguage('{"language": " PT-br "}')).toBe('pt')
	})

	test('resposta fora do formato vira null (o post segue)', () => {
		expect(parseLanguage('{"language": "Portuguese"}')).toBeNull()
		expect(parseLanguage('{"language": 3}')).toBeNull()
		expect(parseLanguage('não é json')).toBeNull()
	})
})
