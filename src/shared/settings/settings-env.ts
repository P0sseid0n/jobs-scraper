import { z } from 'zod'

import { booleanFromEnv } from '../config/load-config'
import { DATE_POSTED_FILTERS, SENIORITY_LEVELS, type SettingsInput, type SettingsKey } from '../contracts/settings'

/**
 * Os valores iniciais de todas as configurações da coleção `settings`. Todo serviço com banco os lê ao subir, antes de
 * qualquer outra coisa, e grava os documentos que ainda não existem (`seedSettings`). Depois valem os do banco.
 */
export const settingsEnv = {
	// Busca (scraper)
	/** Termos de busca separados por vírgula; cada um vira uma busca na mesma coleta. Vazio: o onboarding preenche. */
	SEARCH_KEYWORDS: z.string().trim().default(''),
	SCRAPER_DATE_POSTED: z.enum(DATE_POSTED_FILTERS).default('past-24h'),
	SCRAPER_MAX_POSTS: z.coerce.number().int().positive().default(50),
	/**
	 * 0 = o scraper roda uma coleta e termina. > 0 = fica rodando: coleta a cada N minutos e atende o "coletar agora"
	 * (fila `scraper`). Com o serviço rodando, o intervalo passa a ser o da coleção `settings`.
	 */
	SCRAPER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(0),
	SCRAPER_PAUSED: booleanFromEnv.default(false),

	// Filtros das vagas (post-processing)
	/** Idiomas aceitos (ISO 639-1) separados por vírgula; vazio aceita todos. */
	JOB_LANGUAGES: z.string().default('pt'),
	/** Palavras que a vaga precisa citar (ao menos uma) no cargo ou nos conhecimentos, separadas por vírgula; vazio desliga. */
	JOB_REQUIRED_KEYWORDS: z.string().default(''),
	/** Palavras que descartam a vaga se aparecerem no cargo ou nos conhecimentos, separadas por vírgula. */
	JOB_EXCLUDED_KEYWORDS: z.string().default(''),

	// Perfil profissional
	PROFILE_AREA: z.string().trim().default(''),
	PROFILE_TARGET_ROLE: z.string().trim().default(''),
	PROFILE_SENIORITY: z.union([z.literal(''), z.enum(SENIORITY_LEVELS)]).default(''),
	/** Idiomas em que a pessoa trabalha (ISO 639-1) separados por vírgula. */
	PROFILE_LANGUAGES: z.string().default('pt'),
}

export type SettingsEnv = z.infer<z.ZodObject<typeof settingsEnv>>

/** Os valores iniciais de cada documento da coleção `settings`. */
export type SettingsSeeds = { [K in SettingsKey]: Partial<SettingsInput<K>> }

/**
 * Converte o `.env` nos valores iniciais de cada documento. Variável vazia fica de fora (vale o padrão do schema),
 * para não gravar um campo em branco que o schema recusaria depois.
 */
export function settingsSeedsFromEnv(env: SettingsEnv): SettingsSeeds {
	const terms = [...new Set(env.SEARCH_KEYWORDS.split(',').map(term => term.trim()))].filter(Boolean)
	const profileLanguages = listFromEnv(env.PROFILE_LANGUAGES)

	return {
		scraper: {
			searchTerms: terms.map(term => ({ term, enabled: true })),
			datePosted: env.SCRAPER_DATE_POSTED,
			maxPostsPerRun: env.SCRAPER_MAX_POSTS,
			// Com 0 (execução única) o intervalo não é usado: fica o padrão para quando o serviço rodar continuamente
			...(env.SCRAPER_INTERVAL_MINUTES > 0 ? { intervalMinutes: env.SCRAPER_INTERVAL_MINUTES } : {}),
			paused: env.SCRAPER_PAUSED,
		},
		'post-processing': {
			allowedLanguages: listFromEnv(env.JOB_LANGUAGES),
			requiredKeywords: listFromEnv(env.JOB_REQUIRED_KEYWORDS),
			excludedKeywords: listFromEnv(env.JOB_EXCLUDED_KEYWORDS),
		},
		profile: {
			...(env.PROFILE_AREA ? { area: env.PROFILE_AREA } : {}),
			...(env.PROFILE_TARGET_ROLE ? { targetRole: env.PROFILE_TARGET_ROLE } : {}),
			seniority: env.PROFILE_SENIORITY || null,
			...(profileLanguages.length > 0 ? { languages: profileLanguages } : {}),
		},
	}
}

/** Converte uma lista do `.env` separada por vírgula ("pt, en") em itens em minúsculas, sem vazios. */
export function listFromEnv(value: string) {
	return value
		.split(',')
		.map(item => item.trim().toLowerCase())
		.filter(Boolean)
}
