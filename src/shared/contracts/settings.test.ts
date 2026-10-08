import { describe, expect, test } from 'bun:test'

import { PostProcessingSettingsSchema, ScraperSettingsSchema } from './settings'

describe('ScraperSettingsSchema', () => {
	test('preenche os campos ausentes com os padrões', () => {
		expect(ScraperSettingsSchema.parse({})).toEqual({
			searchTerms: [{ term: 'Front End Vue', enabled: true }],
			datePosted: 'past-24h',
			maxPostsPerRun: 50,
			intervalMinutes: 240,
			paused: false,
		})
	})

	test('exige pelo menos um termo ativo', () => {
		const result = ScraperSettingsSchema.safeParse({ searchTerms: [{ term: 'Vue', enabled: false }] })

		expect(result.success).toBe(false)
		expect(result.error?.issues[0]?.message).toBe('Pelo menos um termo de busca precisa estar ativo')
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
	test('confiança mínima entre 0 e 100, padrão 60', () => {
		expect(PostProcessingSettingsSchema.parse({})).toEqual({ minJobConfidence: 60 })
		expect(PostProcessingSettingsSchema.safeParse({ minJobConfidence: 120 }).success).toBe(false)
	})
})
