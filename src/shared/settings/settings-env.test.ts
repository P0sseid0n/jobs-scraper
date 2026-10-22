import { describe, expect, test } from 'bun:test'

import { parseConfig } from '../config/load-config'
import { PostProcessingSettingsSchema, ProfileSettingsSchema, ScraperSettingsSchema } from '../contracts/settings'
import { settingsEnv, settingsSeedsFromEnv } from './settings-env'

/** As variáveis como o serviço as lê (com os padrões), a partir de um `.env` parcial. */
function seedsOf(env: Record<string, string>) {
	const config = parseConfig(settingsEnv, env)
	if (!config.success) throw config.error

	return settingsSeedsFromEnv(config.data)
}

describe('settingsSeedsFromEnv', () => {
	test('.env vazio: sem termos, sem palavras-chave e sem perfil', () => {
		const seeds = seedsOf({})

		expect(ScraperSettingsSchema.parse(seeds.scraper)).toMatchObject({ searchTerms: [], paused: false })
		expect(PostProcessingSettingsSchema.parse(seeds['post-processing'])).toMatchObject({
			requiredKeywords: [],
			excludedKeywords: [],
		})
		expect(ProfileSettingsSchema.parse(seeds.profile)).toEqual({ seniority: null, languages: ['pt'] })
	})

	test('.env preenchido: todas as configurações vêm dele', () => {
		const seeds = seedsOf({
			SEARCH_KEYWORDS: 'Enfermeiro, Enfermeira ,, Enfermeiro',
			SCRAPER_DATE_POSTED: 'past-week',
			SCRAPER_MAX_POSTS: '30',
			SCRAPER_INTERVAL_MINUTES: '180',
			SCRAPER_PAUSED: 'true',
			REVIEW_CHECKS_PERCENT: '50',
			JOB_LANGUAGES: 'pt, EN',
			JOB_REQUIRED_KEYWORDS: 'enfermagem,COREN',
			JOB_EXCLUDED_KEYWORDS: 'veterinário',
			PROFILE_AREA: ' Enfermagem ',
			PROFILE_TARGET_ROLE: 'Enfermeiro',
			PROFILE_SENIORITY: 'junior',
			PROFILE_LANGUAGES: 'pt,en',
		})

		expect(ScraperSettingsSchema.parse(seeds.scraper)).toEqual({
			searchTerms: [
				{ term: 'Enfermeiro', enabled: true },
				{ term: 'Enfermeira', enabled: true },
			],
			datePosted: 'past-week',
			maxPostsPerRun: 30,
			intervalMinutes: 180,
			paused: true,
		})
		expect(PostProcessingSettingsSchema.parse(seeds['post-processing'])).toEqual({
			reviewChecksPercent: 50,
			allowedLanguages: ['pt', 'en'],
			requiredKeywords: ['enfermagem', 'coren'],
			excludedKeywords: ['veterinário'],
		})
		expect(ProfileSettingsSchema.parse(seeds.profile)).toEqual({
			area: 'Enfermagem',
			targetRole: 'Enfermeiro',
			seniority: 'junior',
			languages: ['pt', 'en'],
		})
	})

	test('intervalo 0 (execução única) não define o intervalo', () => {
		expect(seedsOf({ SCRAPER_INTERVAL_MINUTES: '0' }).scraper.intervalMinutes).toBeUndefined()
	})

	test('variáveis do perfil vazias ficam de fora, em vez de virar um campo em branco', () => {
		const seeds = seedsOf({ PROFILE_AREA: '', PROFILE_TARGET_ROLE: '  ', PROFILE_SENIORITY: '', PROFILE_LANGUAGES: '' })

		expect(seeds.profile).toEqual({ seniority: null })
		expect(ProfileSettingsSchema.safeParse(seeds.profile).success).toBe(true)
	})

	test('senioridade fora dos níveis é recusada ao ler o .env', () => {
		expect(parseConfig(settingsEnv, { PROFILE_SENIORITY: 'pleno' }).success).toBe(false)
	})
})
