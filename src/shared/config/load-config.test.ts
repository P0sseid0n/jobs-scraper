import { describe, expect, test } from 'bun:test'

import { scraperEnv } from '../../services/scraper/config'
import { rabbitmqEnv } from './infrastructure-env'
import { parseConfig } from './load-config'

describe('parseConfig', () => {
	test('aplica valores padrão e converte tipos', () => {
		const result = parseConfig(
			{ ...rabbitmqEnv, ...scraperEnv },
			{ RABBITMQ_URL: 'amqp://u:p@localhost', BROWSER_NO_SANDBOX: 'true' },
		)

		expect(result.success).toBe(true)
		expect(result.data).toMatchObject({
			QUEUE_MAX_RETRIES: 3,
			BROWSER_NO_SANDBOX: true,
			HEADLESS: 'auto',
			SCRAPER_INTERVAL_MINUTES: 0,
		})
	})

	test('falha quando variáveis obrigatórias estão ausentes ou inválidas', () => {
		const result = parseConfig(rabbitmqEnv, { QUEUE_MAX_RETRIES: 'abc' })

		expect(result.success).toBe(false)
		const paths = result.error?.issues.map(issue => issue.path.join('.'))
		expect(paths).toEqual(expect.arrayContaining(['RABBITMQ_URL', 'QUEUE_MAX_RETRIES']))
	})
})
