import { describe, expect, test } from 'bun:test'
import type { Ollama } from 'ollama'

import { PostProcessingSettingsSchema, ScraperSettingsSchema } from '@shared/contracts'
import { createLogger } from '@shared/logging'

import { relevanceRejection } from '../../post-processing/job-relevance'
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

	test('as palavras do cargo-alvo que dizem a área abrem as obrigatórias, sem preposições nem genéricas', () => {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: ['seo'], excludedKeywords: [] },
			{ ...profile, targetRole: 'Técnico(a) de Enfermagem / Instrumentação' },
		)

		expect(result.requiredKeywords).toEqual(['enfermagem', 'instrumentação', 'seo'])
	})

	test('se nenhuma palavra do cargo-alvo diz a área, vai o cargo inteiro', () => {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: ['sql'], excludedKeywords: [] },
			{ ...profile, targetRole: 'Analista de Dados' },
		)

		expect(result.requiredKeywords).toEqual(['analista de dados', 'sql'])
		expect(relevanceRejection({ title: 'Analista de Dados Pleno', necessaryKnowledge: [] }, { ...result })).toBeNull()
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

// Respostas da IA com as palavras genéricas que ela costuma sugerir (a de marketing é a do teste do zero da #30)
const AREA_CASES = [
	{
		profile: { area: 'Marketing', targetRole: 'Analista de Marketing Digital' },
		raw: [
			'analista',
			'marketing',
			'digital',
			'conteúdo',
			'estratégia',
			'campanha',
			'performance',
			'seo',
			'social media',
			'análise',
			'dados',
			'plano',
		],
		required: ['marketing', 'conteúdo', 'campanha', 'performance', 'seo', 'social media'],
		relevant: ['Analista de Marketing Pleno', 'Social Media'],
		outside: ['Advogado(a) contencioso cível e direito digital', 'Analista de Sistemas de Automação – DevOps'],
	},
	{
		profile: { area: 'Saúde', targetRole: 'Enfermeiro Assistencial' },
		raw: ['enfermeiro', 'enfermagem', 'coren', 'uti', 'assistencial', 'supervisor', 'plano'],
		required: ['enfermeiro', 'assistencial', 'enfermagem', 'coren', 'uti'],
		relevant: ['Enfermeira UTI', 'Técnico(a) de Enfermagem'],
		outside: ['Supervisor de Vendas', 'Analista de Planejamento'],
	},
	{
		profile: { area: 'Direito', targetRole: 'Advogado Trabalhista' },
		raw: ['advogado', 'direito', 'oab', 'trabalhista', 'contencioso', 'análise', 'gestão', 'processos'],
		required: ['advogado', 'trabalhista', 'direito', 'oab', 'contencioso'],
		relevant: ['Advogada Trabalhista Sênior', 'Assistente Jurídico - OAB'],
		outside: ['Analista de Processos', 'Gerente de Projetos'],
	},
	{
		profile: { area: 'Comercial', targetRole: 'Executivo de Vendas' },
		raw: ['executivo', 'vendas', 'comercial', 'prospecção', 'crm', 'negócios', 'resultados', 'b2b'],
		required: ['vendas', 'comercial', 'prospecção', 'crm', 'b2b'],
		relevant: ['Executiva de Vendas B2B', 'Consultor Comercial'],
		outside: ['Executivo de Contas Digital', 'Analista de Negócios'],
	},
]

describe('palavras-chave por área', () => {
	for (const area of AREA_CASES) {
		const result = normalizeSuggestions(
			{ searchTerms: [], requiredKeywords: area.raw, excludedKeywords: [] },
			{ ...profile, ...area.profile },
		)

		test(`${area.profile.targetRole}: obrigatórias sem palavras genéricas`, () => {
			expect(result.requiredKeywords).toEqual(area.required)
		})

		test(`${area.profile.targetRole}: as vagas da área passam no filtro, e as de fora não`, () => {
			for (const title of area.relevant) {
				expect(relevanceRejection({ title, necessaryKnowledge: [] }, result)).toBeNull()
			}
			for (const title of area.outside) {
				expect(relevanceRejection({ title, necessaryKnowledge: [] }, result)).not.toBeNull()
			}
		})
	}
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
