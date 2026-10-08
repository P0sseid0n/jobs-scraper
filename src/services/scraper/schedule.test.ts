import { describe, expect, test } from 'bun:test'

import type { ScraperConfig } from './config'
import { nextRunAt, postsPerTerm, settingsSeedFromEnv } from './schedule'

const baseConfig = {
	SEARCH_KEYWORDS: 'Front End Vue',
	SCRAPER_DATE_POSTED: 'past-week',
	SCRAPER_MAX_POSTS: 30,
	SCRAPER_INTERVAL_MINUTES: 0,
} as ScraperConfig

describe('settingsSeedFromEnv', () => {
	test('separa os termos por vírgula, sem vazios nem repetidos', () => {
		const seed = settingsSeedFromEnv({ ...baseConfig, SEARCH_KEYWORDS: 'Vue, React ,, Vue' })

		expect(seed.searchTerms).toEqual([
			{ term: 'Vue', enabled: true },
			{ term: 'React', enabled: true },
		])
	})

	test('intervalo 0 (execução única) não define o intervalo', () => {
		expect(settingsSeedFromEnv(baseConfig).intervalMinutes).toBeUndefined()
		expect(settingsSeedFromEnv({ ...baseConfig, SCRAPER_INTERVAL_MINUTES: 180 }).intervalMinutes).toBe(180)
	})

	test('leva o filtro de data e o limite de posts', () => {
		expect(settingsSeedFromEnv(baseConfig)).toMatchObject({ datePosted: 'past-week', maxPostsPerRun: 30 })
	})
})

describe('postsPerTerm', () => {
	test('divide o limite entre os termos, arredondando para cima', () => {
		expect(postsPerTerm(50, 1)).toBe(50)
		expect(postsPerTerm(50, 3)).toBe(17)
	})

	test('pelo menos 1 post por termo', () => {
		expect(postsPerTerm(1, 5)).toBe(1)
	})
})

describe('nextRunAt', () => {
	test('sem coleta anterior, já está na hora', () => {
		expect(nextRunAt(null, 60).getTime()).toBeLessThanOrEqual(Date.now())
	})

	test('intervalo contado a partir do início da última coleta', () => {
		const last = new Date('2026-10-07T10:00:00Z')

		expect(nextRunAt(last, 90).toISOString()).toBe('2026-10-07T11:30:00.000Z')
	})
})
