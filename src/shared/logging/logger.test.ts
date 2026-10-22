import { expect, test } from 'bun:test'
import pino from 'pino'

import { REDACT_PATHS } from './logger'

test('campos com nome de segredo saem ocultos no log, no objeto e um nível abaixo', () => {
	const lines: string[] = []
	const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[oculto]' } }, { write: (line: string) => lines.push(line) })

	logger.info({ token: 'token-do-bot', account: { email: 'eu@exemplo.com', password: 'senha', liAt: 'cookie' } }, 'teste')

	expect(lines.join('')).not.toMatch(/token-do-bot|"senha"|cookie/)
	expect(JSON.parse(lines[0]!)).toMatchObject({ token: '[oculto]', account: { email: 'eu@exemplo.com', password: '[oculto]' } })
})
