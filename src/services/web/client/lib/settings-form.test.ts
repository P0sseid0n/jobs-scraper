import { describe, expect, test } from 'bun:test'

import { PostProcessingSettingsSchema, ProfileSettingsSchema, ScraperSettingsSchema } from '@shared/contracts'

import { errorFor, profileDraftOf, validateDraft, validateProfile, type SettingsDraft } from './settings-form'

function draft(): SettingsDraft {
	const { paused: _paused, ...scraper } = ScraperSettingsSchema.parse({})
	return {
		scraper,
		'post-processing': PostProcessingSettingsSchema.parse({}),
		profile: profileDraftOf(ProfileSettingsSchema.parse({})),
	}
}

describe('validateDraft (as mesmas regras do servidor)', () => {
	test('padrões são válidos', () => {
		expect(validateDraft(draft())).toEqual({})
	})

	test('termos: repetidos, vazios e ao menos um ativo', () => {
		const value = draft()
		value.scraper.searchTerms = [
			{ term: 'Vue', enabled: false },
			{ term: ' vue ', enabled: false },
			{ term: '', enabled: false },
		]

		expect(validateDraft(value)).toEqual({
			'searchTerms.1.term': 'Termo repetido',
			'searchTerms.2.term': 'Escreva o termo ou remova a linha',
			searchTerms: 'Pelo menos um termo de busca precisa estar ativo',
		})
	})

	test('limites numéricos', () => {
		const value = draft()
		value.scraper.maxPostsPerRun = 201
		value.scraper.intervalMinutes = Number.NaN

		expect(Object.keys(validateDraft(value))).toEqual(['maxPostsPerRun', 'intervalMinutes'])
	})

	test('o resultado aceito pelo cliente também passa no schema do servidor', () => {
		const value = draft()
		value.scraper.searchTerms.push({ term: 'Front-end React', enabled: true })

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
	expect(errorFor({ maxPostsPerRun: 'x' }, 'searchTerms')).toBeNull()
})
