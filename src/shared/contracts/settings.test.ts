import { describe, expect, test } from 'bun:test'

import {
	activeSearchTerms,
	isProfileComplete,
	PostProcessingSettingsSchema,
	ProfileSettingsSchema,
	ScraperSettingsSchema,
} from './settings'

describe('ScraperSettingsSchema', () => {
	test('preenche os campos ausentes com os padrões, sem nenhum termo de busca', () => {
		expect(ScraperSettingsSchema.parse({})).toEqual({
			searchTerms: [],
			datePosted: 'past-24h',
			maxPostsPerRun: 50,
			intervalMinutes: 240,
			paused: false,
		})
	})

	test('aceita ficar sem termos ativos (o scraper espera a configuração)', () => {
		const settings = ScraperSettingsSchema.parse({ searchTerms: [{ term: 'Enfermagem', enabled: false }] })

		expect(activeSearchTerms(settings)).toEqual([])
		expect(activeSearchTerms(ScraperSettingsSchema.parse({}))).toEqual([])
	})

	test('termos ativos: só os ligados, na ordem', () => {
		const settings = ScraperSettingsSchema.parse({
			searchTerms: [{ term: 'Enfermeiro' }, { term: 'Técnico de Enfermagem', enabled: false }, { term: 'Enfermeira' }],
		})

		expect(activeSearchTerms(settings)).toEqual(['Enfermeiro', 'Enfermeira'])
	})

	test('mantém os termos já salvos', () => {
		const saved = { searchTerms: [{ term: 'Front End Vue', enabled: true }] }

		expect(ScraperSettingsSchema.parse(saved).searchTerms).toEqual(saved.searchTerms)
	})

	test('rejeita termos repetidos (sem diferenciar maiúsculas)', () => {
		const result = ScraperSettingsSchema.safeParse({ searchTerms: [{ term: 'Vue' }, { term: 'vue' }] })

		expect(result.success).toBe(false)
	})

	test('rejeita limites fora da faixa', () => {
		expect(ScraperSettingsSchema.safeParse({ maxPostsPerRun: 500 }).success).toBe(false)
		expect(ScraperSettingsSchema.safeParse({ intervalMinutes: 0 }).success).toBe(false)
	})
})

describe('PostProcessingSettingsSchema', () => {
	test('padrões', () => {
		expect(PostProcessingSettingsSchema.parse({})).toEqual({
			allowedLanguages: ['pt'],
			requiredKeywords: [],
			excludedKeywords: [],
		})
	})

	test('idiomas: normaliza, remove repetidos e exige o código ISO 639-1', () => {
		expect(PostProcessingSettingsSchema.parse({ allowedLanguages: ['PT', ' en ', 'pt'] }).allowedLanguages).toEqual(['pt', 'en'])
		expect(PostProcessingSettingsSchema.safeParse({ allowedLanguages: ['português'] }).success).toBe(false)
	})

	test('palavras-chave: minúsculas, sem repetidos e sem vazias', () => {
		expect(PostProcessingSettingsSchema.parse({ requiredKeywords: ['Vue', ' vue ', 'Front-end'] }).requiredKeywords).toEqual([
			'vue',
			'front-end',
		])
		expect(PostProcessingSettingsSchema.safeParse({ excludedKeywords: [' '] }).success).toBe(false)
	})
})

describe('ProfileSettingsSchema', () => {
	test('nasce sem área nem cargo-alvo, e incompleto', () => {
		const profile = ProfileSettingsSchema.parse({})

		expect(profile).toEqual({ seniority: null, languages: ['pt'] })
		expect(isProfileComplete(profile)).toBe(false)
	})

	test('normaliza os textos e os idiomas', () => {
		const profile = ProfileSettingsSchema.parse({
			area: ' Marketing ',
			targetRole: ' Analista de Marketing Digital ',
			languages: ['PT', ' en ', 'pt'],
		})

		expect(profile).toEqual({
			area: 'Marketing',
			targetRole: 'Analista de Marketing Digital',
			seniority: null,
			languages: ['pt', 'en'],
		})
		expect(isProfileComplete(profile)).toBe(true)
	})

	test('área e cargo-alvo não podem ficar em branco, e é preciso ao menos um idioma', () => {
		const result = ProfileSettingsSchema.safeParse({ area: ' ', targetRole: '', languages: [] })

		expect(result.error?.issues.map(issue => [issue.path.join('.'), issue.message])).toEqual([
			['area', 'Informe a área'],
			['targetRole', 'Informe o cargo-alvo'],
			['languages', 'Escolha pelo menos um idioma'],
		])
	})

	test('senioridade: um dos níveis ou nenhuma', () => {
		expect(ProfileSettingsSchema.parse({ seniority: 'senior' }).seniority).toBe('senior')
		expect(ProfileSettingsSchema.parse({ seniority: null }).seniority).toBeNull()
		expect(ProfileSettingsSchema.safeParse({ seniority: 'sênior' }).success).toBe(false)
	})

	test('idiomas: exige o código ISO 639-1', () => {
		expect(ProfileSettingsSchema.safeParse({ languages: ['português'] }).success).toBe(false)
	})
})
