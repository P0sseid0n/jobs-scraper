import mongoose, { Schema } from 'mongoose'

/** `schedule`: coleta automática; `manual`: pedido pela fila `scraper`; `once`: execução única (intervalo 0 no .env). */
export const SCRAPER_RUN_TRIGGERS = ['schedule', 'manual', 'once'] as const
export const SCRAPER_RUN_STATUSES = ['running', 'success', 'failed'] as const

/**
 * Por que a busca de um termo não trouxe posts. `empty`: o LinkedIn disse que a busca não tem resultados (não é
 * falha); `no-posts`: a página carregou sem nenhum post reconhecido (busca vazia que não foi reconhecida ou seletores
 * desatualizados); `timeout`: a página não carregou a tempo; `unknown`: qualquer outro erro.
 */
export const SCRAPER_TERM_ERROR_KINDS = ['empty', 'no-posts', 'timeout', 'unknown'] as const

export type ScraperTermErrorKind = (typeof SCRAPER_TERM_ERROR_KINDS)[number]
export type ScraperRunTrigger = (typeof SCRAPER_RUN_TRIGGERS)[number]
export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number]

export type ScraperRunTerm = {
	term: string

	/** Posts novos enviados para a IA a partir desse termo. */
	sent: number

	/** Posts da busca que já tinham passado pela IA numa coleta anterior (não são enviados de novo). */
	skipped: number

	/** Posts novos em um idioma fora dos aceitos: ignorados já na coleta, sem contar no limite de posts. */
	otherLanguage: number

	/** Ids dos posts enviados, para contar as vagas que saíram da coleta; ausente nas coletas antigas. */
	postIds: string[]

	error: string | null

	/** O tipo do `error`; ausente nas coletas antigas. */
	errorKind: ScraperTermErrorKind | null

	/** A busca aberta no LinkedIn, para conferir o resultado; ausente nas coletas antigas. */
	searchUrl: string | null
}

type ScraperRunDocument = {
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: Date
	finishedAt: Date | null
	terms: ScraperRunTerm[]
	sent: number
	error: string | null
}

const HISTORY_DAYS = 90

/** Histórico das coletas: status da coleta em andamento, última coleta e próxima agendada. */
const scraperRunSchema = new Schema<ScraperRunDocument>(
	{
		trigger: { type: String, enum: SCRAPER_RUN_TRIGGERS, required: true },
		status: { type: String, enum: SCRAPER_RUN_STATUSES, required: true },
		startedAt: { type: Date, required: true },
		finishedAt: { type: Date, default: null },
		terms: {
			type: [
				{
					term: String,
					sent: Number,
					skipped: { type: Number, default: 0 },
					otherLanguage: { type: Number, default: 0 },
					postIds: { type: [String], default: [] },
					error: { type: String, default: null },
					errorKind: { type: String, enum: SCRAPER_TERM_ERROR_KINDS, default: null },
					searchUrl: { type: String, default: null },
					_id: false,
				},
			],
			default: [],
		},
		sent: { type: Number, default: 0 },
		error: { type: String, default: null },
	},
	{ versionKey: false },
)

// Mais recentes primeiro; o MongoDB apaga sozinho as coletas com mais de 90 dias
scraperRunSchema.index({ startedAt: -1 }, { expireAfterSeconds: HISTORY_DAYS * 24 * 60 * 60 })

export const ScraperRun = mongoose.model('ScraperRun', scraperRunSchema, 'scraper_runs')
