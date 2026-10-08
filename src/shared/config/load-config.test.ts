import { describe, expect, test } from 'bun:test'

import { discordEnv } from '../../services/discord-bot/config'
import { scraperEnv } from '../../services/scraper/config'
import { rabbitmqEnv } from './infrastructure-env'
import { parseConfig } from './load-config'

describe('parseConfig', () => {
	test('aplica valores padrão e converte tipos', () => {
		const result = parseConfig(
			{ ...rabbitmqEnv, ...scraperEnv },
			{ RABBITMQ_URL: 'amqp://u:p@localhost', LINKEDIN_EMAIL: 'a@b.com', LINKEDIN_PASSWORD: 'x', HEADLESS: 'true' },
		)

		expect(result.success).toBe(true)
		expect(result.data).toMatchObject({ QUEUE_MAX_RETRIES: 3, HEADLESS: true, SCRAPER_MAX_POSTS: 50 })
	})

	test('falha quando variáveis obrigatórias estão ausentes ou inválidas', () => {
		const result = parseConfig(discordEnv, { DISCORD_CHANNEL_ID: 'abc' })

		expect(result.success).toBe(false)
		const paths = result.error?.issues.map(issue => issue.path.join('.'))
		expect(paths).toEqual(expect.arrayContaining(['DISCORD_TOKEN', 'DISCORD_CHANNEL_ID']))
	})
})
