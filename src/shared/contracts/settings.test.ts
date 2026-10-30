import { describe, expect, test } from 'bun:test'

import {
	activeSearchTerms,
	isProfileComplete,
	MessageSettingsSchema,
	PostProcessingSettingsSchema,
	ProfileSettingsSchema,
	ScraperSettingsSchema,
} from './settings'

describe('ScraperSettingsSchema', () => {
	test('preenche os campos ausentes com os padrões, sem nenhum termo de busca', () => {
		expect(ScraperSettingsSchema.parse({})).toEqual({
			searchTerms: [],
			datePosted: 'past-24h',
			minJobsPerRun: 10,
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
		expect(ScraperSettingsSchema.safeParse({ minJobsPerRun: 51 }).success).toBe(false)
		expect(ScraperSettingsSchema.safeParse({ intervalMinutes: 0 }).success).toBe(false)
	})
})

describe('PostProcessingSettingsSchema', () => {
	test('padrões; limite dos checks entre 1 e 100%', () => {
		expect(PostProcessingSettingsSchema.parse({})).toEqual({
			reviewChecksPercent: 60,
			allowedLanguages: ['pt'],
			requiredKeywords: [],
			excludedKeywords: [],
			blockedCompanies: [],
			duplicateSimilarityPercent: 60,
			duplicateWindowDays: 30,
		})
		expect(PostProcessingSettingsSchema.safeParse({ reviewChecksPercent: 0 }).success).toBe(false)
		expect(PostProcessingSettingsSchema.safeParse({ reviewChecksPercent: 120 }).success).toBe(false)
	})

	test('agrupamento de repostagens: semelhança de 1 a 100% e janela de 1 a 365 dias', () => {
		expect(PostProcessingSettingsSchema.safeParse({ duplicateSimilarityPercent: 0 }).success).toBe(false)
		expect(PostProcessingSettingsSchema.safeParse({ duplicateSimilarityPercent: 101 }).success).toBe(false)
		expect(PostProcessingSettingsSchema.safeParse({ duplicateWindowDays: 0 }).success).toBe(false)
		expect(PostProcessingSettingsSchema.safeParse({ duplicateWindowDays: 400 }).success).toBe(false)
		expect(PostProcessingSettingsSchema.parse({ duplicateWindowDays: 7 }).duplicateWindowDays).toBe(7)
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

	test('empresas bloqueadas: mantém a grafia e tira a mesma empresa escrita de outro jeito', () => {
		expect(
			PostProcessingSettingsSchema.parse({ blockedCompanies: [' Acme Ltda. ', 'ACME', 'Banco Itaú S.A.', 'banco itau'] })
				.blockedCompanies,
		).toEqual(['Acme Ltda.', 'Banco Itaú S.A.'])
		expect(PostProcessingSettingsSchema.parse({ blockedCompanies: ['---'] }).blockedCompanies).toEqual([])
		expect(PostProcessingSettingsSchema.safeParse({ blockedCompanies: [' '] }).success).toBe(false)
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

describe('MessageSettingsSchema', () => {
	/** O primeiro erro de cada campo, como a API devolve. */
	function errorsOf(input: unknown) {
		const result = MessageSettingsSchema.safeParse(input)
		if (result.success) return {}

		return Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]))
	}

	const template = (body: string, subject = 'Candidatura – {{cargo}}') => ({ template: { subject, body } })

	test('nasce com o modelo padrão e sem variáveis próprias', () => {
		const settings = MessageSettingsSchema.parse({})

		expect(settings.template.subject).toBe('Candidatura – {{cargo}}')
		expect(settings.template.body).toContain('{{cargo}}')
		expect(settings.variables).toEqual([])
		expect(settings.fallbacks).toEqual({})
	})

	test('ignora o estilo da IA salvo antes (modo, tom, tamanho e exemplo)', () => {
		const settings = MessageSettingsSchema.parse({
			mode: 'ai',
			tone: 'auto',
			length: 'short',
			styleSample: 'Oi',
		})

		expect(settings).not.toContainKeys(['mode', 'tone', 'length', 'styleSample'])
	})

	test('a assinatura de antes vai para o fim do modelo, uma vez só', () => {
		const signature = '🔗 GitHub: https://github.com/exemplo'
		const moved = MessageSettingsSchema.parse({ signature: `  ${signature}\n` })

		expect(moved).not.toContainKey('signature')
		expect(moved.template.body).toEndWith(`Obrigado!\n\n${signature}`)
		expect(moved.template.subject).toBe('Candidatura – {{cargo}}')

		// Salvo de novo (com o campo ainda lá, ou já sem ele), não repete
		expect(MessageSettingsSchema.parse({ ...moved, signature }).template.body).toBe(moved.template.body)
		expect(MessageSettingsSchema.parse(moved).template.body).toBe(moved.template.body)

		const own = { subject: 'Oi', body: 'Meu texto' }
		expect(MessageSettingsSchema.parse({ template: own, signature }).template.body).toBe(`Meu texto\n\n${signature}`)
		expect(MessageSettingsSchema.parse({ template: own, signature: '  ' }).template.body).toBe('Meu texto')
	})

	test('aceita um modelo com variáveis prontas, próprias e fallbacks', () => {
		const result = MessageSettingsSchema.safeParse({
			...template('Sou {{ meu_nome }}, vi a vaga na {{empresa | sua empresa}}. {{link_github}}'),
			variables: [
				{ name: 'meu_nome', description: 'Seu nome', type: 'text', value: 'Carla' },
				{ name: 'link_github', description: 'GitHub', type: 'link', value: 'https://github.com/carla' },
			],
			fallbacks: { local: 'sua cidade' },
		})

		expect(result.success).toBe(true)
	})

	test('recusa variável desconhecida no modelo', () => {
		expect(errorsOf(template('Vi a vaga na {{empressa}}'))['template.body']).toContain('{{empressa}} não existe')
		expect(errorsOf(template('Olá', '{{vaga}}'))['template.subject']).toContain('{{vaga}} não existe')
	})

	test('recusa variável de link no assunto, mas aceita na mensagem', () => {
		expect(errorsOf(template('{{link_da_vaga}}', 'Vaga {{link_da_vaga}}'))['template.subject']).toContain('só funciona na mensagem')
		expect(errorsOf(template('{{link_da_vaga}}'))).toEqual({})
	})

	test('recusa nome repetido', () => {
		const variable = { name: 'contato', type: 'text', value: '(31) 99999-0000' }

		expect(errorsOf({ variables: [variable, { ...variable, value: 'outro' }] })['variables.1.name']).toBe(
			'Já há uma variável com esse nome',
		)
	})

	test('recusa variável própria com o nome de uma pronta', () => {
		expect(errorsOf({ variables: [{ name: 'empresa', value: 'Minha' }] })['variables.0.name']).toContain('já é uma variável pronta')
	})

	test('recusa nome fora do snake_case', () => {
		expect(errorsOf({ variables: [{ name: 'Meu Nome', value: 'Carla' }] })['variables.0.name']).toContain('minúsculas')
		expect(errorsOf({ variables: [{ name: 'meu_nome', value: 'Carla' }] })).toEqual({})
	})

	test('recusa link que não é http ou https', () => {
		const link = (value: string) => ({ variables: [{ name: 'portfolio', type: 'link', value }] })

		expect(errorsOf(link('javascript:alert(1)'))['variables.0.value']).toContain('http')
		expect(errorsOf(link('github.com/carla'))['variables.0.value']).toContain('http')
		expect(errorsOf(link('https://carla.dev'))).toEqual({})
	})

	test('recusa fallback vazio, nas configurações e na própria variável', () => {
		expect(errorsOf({ fallbacks: { empresa: '  ' } })['fallbacks.empresa']).toContain('apague o fallback')
		expect(errorsOf(template('Vaga na {{empresa | }}'))['template.body']).toContain('fallback de {{empresa}} está vazio')
	})

	test('recusa fallback de variável que nunca falta', () => {
		expect(errorsOf({ fallbacks: { cargo: 'a vaga' } })['fallbacks.cargo']).toContain('nunca falta')
	})
})
