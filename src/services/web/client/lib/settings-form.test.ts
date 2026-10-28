import { describe, expect, test } from 'bun:test'

import { MessageSettingsSchema, PostProcessingSettingsSchema, ProfileSettingsSchema, ScraperSettingsSchema } from '@shared/contracts'

import { duplicateSimilarityHint, errorFor, profileDraftOf, validateDraft, validateProfile, type SettingsDraft } from './settings-form'

function draft(): SettingsDraft {
	const { paused: _paused, ...scraper } = ScraperSettingsSchema.parse({})
	return {
		scraper,
		'post-processing': PostProcessingSettingsSchema.parse({}),
		profile: profileDraftOf(ProfileSettingsSchema.parse({})),
		message: MessageSettingsSchema.parse({}),
	}
}

describe('validateDraft (as mesmas regras do servidor)', () => {
	test('padrões são válidos', () => {
		expect(validateDraft(draft())).toEqual({})
	})

	test('termos: repetidos e vazios; sem nenhum ativo é válido', () => {
		const value = draft()
		value.scraper.searchTerms = [
			{ term: 'Vue', enabled: false },
			{ term: ' vue ', enabled: false },
			{ term: '', enabled: false },
		]

		expect(validateDraft(value)).toEqual({
			'searchTerms.1.term': 'Termo repetido',
			'searchTerms.2.term': 'Escreva o termo ou remova a linha',
		})
	})

	test('limites numéricos', () => {
		const value = draft()
		value.scraper.minJobsPerRun = 51
		value.scraper.intervalMinutes = Number.NaN
		value['post-processing'].duplicateWindowDays = 0

		expect(Object.keys(validateDraft(value))).toEqual(['minJobsPerRun', 'intervalMinutes', 'duplicateWindowDays'])
	})

	test('a mensagem de exemplo tem o limite do servidor', () => {
		const value = draft()
		value.message.styleSample = 'a'.repeat(1501)

		expect(validateDraft(value)).toEqual({ styleSample: 'Use até 1.500 caracteres' })
		expect(MessageSettingsSchema.safeParse(value.message).success).toBe(false)
	})

	test('a assinatura tem o limite do servidor', () => {
		const value = draft()
		value.message.signature = 'a'.repeat(501)

		expect(validateDraft(value)).toEqual({ signature: 'Use até 500 caracteres' })
		expect(MessageSettingsSchema.safeParse(value.message).success).toBe(false)
	})

	test('o resultado aceito pelo cliente também passa no schema do servidor', () => {
		const value = draft()
		value.scraper.searchTerms.push({ term: 'Técnico de Enfermagem', enabled: true })

		expect(validateDraft(value)).toEqual({})
		expect(ScraperSettingsSchema.safeParse({ ...value.scraper, paused: false }).success).toBe(true)
	})
})

describe('validateProfile', () => {
	test('área, cargo-alvo e ao menos um idioma são obrigatórios', () => {
		const value = draft()
		value.profile.area = '  '
		value.profile.languages = []

		expect(validateProfile(value.profile)).toEqual({
			area: 'Informe a área',
			targetRole: 'Informe o cargo-alvo',
			languages: 'Escolha pelo menos um idioma',
		})
	})

	test('o perfil aceito pelo cliente também passa no schema do servidor', () => {
		const value = draft()
		value.profile = { area: 'Marketing', targetRole: 'Analista de Marketing Digital', seniority: 'mid', languages: ['pt', 'en'] }

		expect(validateProfile(value.profile)).toEqual({})
		expect(ProfileSettingsSchema.safeParse(value.profile).success).toBe(true)
	})
})

test('errorFor: o erro do campo ou de um campo dentro dele', () => {
	expect(errorFor({ 'searchTerms.2.term': 'Termo repetido' }, 'searchTerms')).toBe('Termo repetido')
	expect(errorFor({ minJobsPerRun: 'x' }, 'searchTerms')).toBeNull()
})

test('duplicateSimilarityHint: um texto por faixa, com o padrão (60%) no recomendado', () => {
	const hints = [1, 29, 30, 49, 50, 69, 70, 89, 90, 100].map(duplicateSimilarityHint)

	expect(new Set(hints).size).toBe(5)
	expect(hints[0]).toBe(hints[1])
	expect(hints[1]).not.toBe(hints[2])
	expect(duplicateSimilarityHint(PostProcessingSettingsSchema.parse({}).duplicateSimilarityPercent)).toContain('recomendado')
})
