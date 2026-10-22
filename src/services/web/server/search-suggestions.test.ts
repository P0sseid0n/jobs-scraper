import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { PostProcessingSettingsSchema, ScraperSettingsSchema } from '@shared/contracts'
import { createLogger } from '@shared/logging'

import { buildSuggestionMessages, normalizeSuggestions, suggestSearchSettings, type SuggestionProfile } from './search-suggestions'

const log = createLogger('test')

const profile: SuggestionProfile = {
	area: 'Enfermagem',
	targetRole: 'Enfermeiro',
	seniority: 'junior',
	languages: ['pt'],
}

/** Simula o Ollama devolvendo uma resposta (ou falhando). */
function fakeOllama(response: unknown) {
	const calls: { messages: { content: string }[]; format: unknown }[] = []
	const ollama = {
		chat: async (request: (typeof calls)[number]) => {
			calls.push(request)
			if (response instanceof Error) throw response
			return { message: { content: typeof response === 'string' ? response : JSON.stringify(response) } }
		},
	} as unknown as Ollama

	return { ollama, calls }
}

describe('buildSuggestionMessages', () => {
	test('passa a área, o cargo-alvo, a senioridade e os idiomas do perfil', () => {
		const content = buildSuggestionMessages(profile)[1]?.content

		expect(content).toBe('Field: Enfermagem\nTarget role: Enfermeiro\nSeniority: junior\nLanguages (ISO 639-1): pt')
	})

	test('sem senioridade, a linha fica de fora', () => {
		expect(buildSuggestionMessages({ ...profile, seniority: null })[1]?.content).not.toContain('Seniority')
	})
})

describe('normalizeSuggestions', () => {
	test('o cargo-alvo vem primeiro, sem repetir (ignorando caixa)', () => {
		const result = normalizeSuggestions(
			{ searchTerms: ['enfermeiro', 'Enfermeira', ' Enfermeiro Assistencial '], requiredKeywords: [], excludedKeywords: [] },
			profile,
		)

		expect(result.searchTerms).toEqual(['Enfermeiro', 'Enfermeira', 'Enfermeiro Assistencial'])
	})

	test('palavras-chave em minúsculas, sem vazias, aspas, hashtags nem repetidas', () => {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: ['Enfermagem', ' enfermagem ', '', '#COREN', '"UTI"'], excludedKeywords: [] },
			profile,
		)

		expect(result.requiredKeywords).toEqual(['enfermeiro', 'enfermagem', 'coren', 'uti'])
	})

	test('as palavras do cargo-alvo abrem as obrigatórias, sem preposições', () => {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: ['marketing', 'seo'], excludedKeywords: [] },
			{ ...profile, targetRole: 'Analista de Marketing Digital' },
		)

		expect(result.requiredKeywords).toEqual(['analista', 'marketing', 'digital', 'seo'])
	})

	test('uma palavra não é obrigatória e excluída ao mesmo tempo', () => {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: ['enfermagem'], excludedKeywords: ['Enfermagem', 'enfermeiro', 'veterinário'] },
			profile,
		)

		expect(result.excludedKeywords).toEqual(['veterinário'])
	})

	test('corta o excesso e os itens longos demais, e o resultado passa nos schemas das configurações', () => {
		const many = Array.from({ length: 30 }, (_, index) => `termo ${index}`)
		const result = normalizeSuggestions(
			{ searchTerms: [...many, 'x'.repeat(101)], requiredKeywords: ['y'.repeat(51), ...many], excludedKeywords: many },
			profile,
		)

		expect(result.searchTerms).toHaveLength(5)
		expect(result.requiredKeywords).toHaveLength(12)
		expect(result.requiredKeywords.slice(0, 2)).toEqual(['enfermeiro', 'termo 0'])
		expect(result.excludedKeywords.length).toBeLessThanOrEqual(5)

		const searchTerms = result.searchTerms.map(term => ({ term, enabled: true }))
		expect(ScraperSettingsSchema.safeParse({ searchTerms }).success).toBe(true)
		expect(PostProcessingSettingsSchema.safeParse(result).success).toBe(true)
	})
})

describe('suggestSearchSettings', () => {
	test('usa a resposta da IA, com o formato pedido no structured output', async () => {
		const { ollama, calls } = fakeOllama({
			searchTerms: ['Enfermeira', 'Técnico de Enfermagem'],
			requiredKeywords: ['enfermagem', 'enfermeiro', 'coren'],
			excludedKeywords: ['veterinário'],
		})

		expect(await suggestSearchSettings({ ollama, model: 'm' }, profile, log)).toEqual({
			searchTerms: ['Enfermeiro', 'Enfermeira', 'Técnico de Enfermagem'],
			requiredKeywords: ['enfermeiro', 'enfermagem', 'coren'],
			excludedKeywords: ['veterinário'],
			fromAi: true,
		})
		expect(calls[0]?.format).toMatchObject({ required: ['searchTerms', 'requiredKeywords', 'excludedKeywords'] })
	})

	test('se a IA falhar ou responder fora do formato, sugere só o cargo-alvo e as palavras dele', async () => {
		const fallback = { searchTerms: ['Enfermeiro'], requiredKeywords: ['enfermeiro'], excludedKeywords: [], fromAi: false }

		expect(await suggestSearchSettings({ ollama: fakeOllama(new Error('timeout')).ollama, model: 'm' }, profile, log)).toEqual(
			fallback,
		)
		expect(await suggestSearchSettings({ ollama: fakeOllama('não é json').ollama, model: 'm' }, profile, log)).toEqual(fallback)
	})
})
