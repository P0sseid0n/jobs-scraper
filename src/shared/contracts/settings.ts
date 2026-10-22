import { z } from 'zod'

/**
 * Configurações editáveis em tempo de execução (por outras fontes). Ficam na coleção `settings`
 * do MongoDB, um documento por serviço; o `.env` só define os valores iniciais.
 */

export const DATE_POSTED_FILTERS = ['past-24h', 'past-week', 'past-month', 'any'] as const
export type DatePostedFilter = (typeof DATE_POSTED_FILTERS)[number]

export const MAX_SEARCH_TERMS = 10

const SearchTermSchema = z.object({
	term: z.string().trim().min(1).max(100),
	enabled: z.boolean().default(true),
})

export const ScraperSettingsSchema = z
	.object({
		/** Cada termo ativo vira uma busca no LinkedIn, em sequência, na mesma coleta. */
		searchTerms: z
			.array(SearchTermSchema)
			.min(1)
			.max(MAX_SEARCH_TERMS)
			.default([{ term: 'Front End Vue', enabled: true }]),

		datePosted: z.enum(DATE_POSTED_FILTERS).default('past-24h'),

		/** Limite de posts por coleta (somando todos os termos), para reduzir o risco de bloqueio da conta. */
		maxPostsPerRun: z.number().int().min(1).max(200).default(50),

		/** Intervalo entre coletas automáticas, contado a partir do início da última. */
		intervalMinutes: z
			.number()
			.int()
			.min(1)
			.max(7 * 24 * 60)
			.default(240),

		/** Pausa as coletas automáticas; um pedido manual ("coletar agora") ainda funciona. */
		paused: z.boolean().default(false),
	})
	.refine(settings => settings.searchTerms.some(term => term.enabled), {
		message: 'Pelo menos um termo de busca precisa estar ativo',
		path: ['searchTerms'],
	})
	.refine(settings => new Set(settings.searchTerms.map(term => term.term.toLowerCase())).size === settings.searchTerms.length, {
		message: 'Há termos de busca repetidos',
		path: ['searchTerms'],
	})

export type ScraperSettings = z.output<typeof ScraperSettingsSchema>

/** Lista de palavras-chave sem repetidos (a comparação ignora caixa, acentos, hífen e ".js"). */
const keywordList = z
	.array(z.string().trim().min(1).max(50))
	.max(50)
	.default([])
	.transform(keywords => [...new Set(keywords.map(keyword => keyword.toLowerCase()))])

export const PostProcessingSettingsSchema = z.object({
	/** Posts com confiança da IA abaixo disso são descartados (não viram vaga). */
	minJobConfidence: z.number().min(0).max(100).default(60),

	/** Idiomas aceitos (ISO 639-1, ex.: "pt", "en"), detectados no texto do post; lista vazia aceita todos. */
	allowedLanguages: z
		.array(
			z
				.string()
				.trim()
				.toLowerCase()
				.regex(/^[a-z]{2}$/, 'Use o código ISO 639-1 do idioma (ex.: "pt", "en")'),
		)
		.max(20)
		.default(['pt'])
		.transform(languages => [...new Set(languages)]),

	/** A vaga precisa citar ao menos uma destas palavras no cargo ou nos conhecimentos; lista vazia desliga o filtro. */
	requiredKeywords: keywordList,

	/** A vaga é descartada se citar alguma destas palavras no cargo ou nos conhecimentos. */
	excludedKeywords: keywordList,
})

export type PostProcessingSettings = z.output<typeof PostProcessingSettingsSchema>

export const SENIORITY_LEVELS = ['intern', 'junior', 'mid', 'senior', 'lead'] as const
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number]

export const MAX_PROFILE_LANGUAGES = 10

/**
 * O perfil profissional da pessoa, lido pelos serviços para não supor uma área. Sem valor no `.env`: nasce sem área
 * e cargo-alvo, e o onboarding preenche. Depois de preenchidos, eles não podem ficar em branco.
 */
export const ProfileSettingsSchema = z.object({
	/** A área de atuação (ex.: "Marketing", "Enfermagem"). */
	area: z.string().trim().min(1, 'Informe a área').max(80).optional(),

	/** O cargo procurado (ex.: "Analista de Marketing Digital"). */
	targetRole: z.string().trim().min(1, 'Informe o cargo-alvo').max(100).optional(),

	seniority: z.enum(SENIORITY_LEVELS).nullable().default(null),

	/** Idiomas em que a pessoa trabalha (ISO 639-1, ex.: "pt", "en"). */
	languages: z
		.array(
			z
				.string()
				.trim()
				.toLowerCase()
				.regex(/^[a-z]{2}$/, 'Use o código ISO 639-1 do idioma (ex.: "pt", "en")'),
		)
		.min(1, 'Escolha pelo menos um idioma')
		.max(MAX_PROFILE_LANGUAGES)
		.default(['pt'])
		.transform(languages => [...new Set(languages)]),
})

export type ProfileSettings = z.output<typeof ProfileSettingsSchema>

/** Se o perfil tem o mínimo para os serviços e o onboarding deixarem de supor a área (área e cargo-alvo). */
export function isProfileComplete(profile: ProfileSettings) {
	return !!profile.area && !!profile.targetRole
}

/** Schema de cada documento da coleção `settings`, pelo `_id`. */
export const SETTINGS_SCHEMAS = {
	scraper: ScraperSettingsSchema,
	'post-processing': PostProcessingSettingsSchema,
	profile: ProfileSettingsSchema,
} as const

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS
export type SettingsOf<K extends SettingsKey> = z.output<(typeof SETTINGS_SCHEMAS)[K]>
export type SettingsInput<K extends SettingsKey> = z.input<(typeof SETTINGS_SCHEMAS)[K]>
