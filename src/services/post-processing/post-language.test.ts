import { describe, expect, test } from 'bun:test'

import { parseLanguage } from './post-language'

describe('parseLanguage', () => {
	test('código ISO 639-1, sem a região', () => {
		expect(parseLanguage('{"language": "en"}')).toBe('en')
		expect(parseLanguage('{"language": " PT-br "}')).toBe('pt')
	})

	test('código ISO 639-3 vira ISO 639-1 (o modelo respondeu "eng" para "Front-End Developer")', () => {
		expect(parseLanguage('{"language": "eng"}')).toBe('en')
		expect(parseLanguage('{"language": "POR"}')).toBe('pt')
		expect(parseLanguage('{"language": "arb"}')).toBe('ar')
	})

	test('resposta fora do formato vira null (o post segue)', () => {
		expect(parseLanguage('{"language": "Portuguese"}')).toBeNull()
		expect(parseLanguage('{"language": 3}')).toBeNull()
		expect(parseLanguage('{"language": "xyz"}')).toBeNull()
		expect(parseLanguage('não é json')).toBeNull()
	})
})
