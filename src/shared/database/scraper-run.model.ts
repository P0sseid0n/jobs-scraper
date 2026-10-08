import mongoose, { Schema } from 'mongoose'

/** `schedule`: coleta automática; `manual`: pedido pela fila `scraper`; `once`: execução única (intervalo 0 no .env). */
export const SCRAPER_RUN_TRIGGERS = ['schedule', 'manual', 'once'] as const
export const SCRAPER_RUN_STATUSES = ['running', 'success', 'failed'] as const

export type ScraperRunTrigger = (typeof SCRAPER_RUN_TRIGGERS)[number]
export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number]

export type ScraperRunTerm = {
	term: string

	/** Posts enviados para a IA a partir desse termo. */
	sent: number

	error: string | null
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
			type: [{ term: String, sent: Number, error: { type: String, default: null }, _id: false }],
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
