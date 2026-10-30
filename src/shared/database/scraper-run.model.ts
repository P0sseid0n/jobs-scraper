import mongoose, { Schema } from 'mongoose'

import { Job } from './job.model'

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

/**
 * Por que o login do LinkedIn parou a coleta: a verificação não foi resolvida a tempo, um captcha (só dá para resolver
 * numa janela), o e-mail ou a senha recusados, sem conta, ou outro motivo.
 */
export const SCRAPER_LOGIN_FAILURES = ['verification', 'captcha', 'credentials', 'no-account', 'other'] as const
export type ScraperLoginFailure = (typeof SCRAPER_LOGIN_FAILURES)[number]
export type ScraperRunTrigger = (typeof SCRAPER_RUN_TRIGGERS)[number]
export type ScraperRunStatus = (typeof SCRAPER_RUN_STATUSES)[number]

export type ScraperRunTerm = {
	term: string

	/** Posts novos enviados para a IA a partir desse termo. */
	sent: number

	/** Posts da busca que já tinham passado pela IA numa coleta anterior (não são enviados de novo). */
	skipped: number

	/** Posts novos em um idioma fora dos aceitos: ignorados já na coleta, sem contar no mínimo de vagas. */
	otherLanguage: number

	/** Ids dos posts enviados, para contar as vagas que saíram da coleta; ausente nas coletas antigas. */
	postIds: string[]

	error: string | null

	/** O tipo do `error`; ausente nas coletas antigas. */
	errorKind: ScraperTermErrorKind | null

	/** A busca aberta no LinkedIn, para conferir o resultado; ausente nas coletas antigas. */
	searchUrl: string | null

	/**
	 * O período da última busca do termo (o das configurações, ou um mais amplo quando a coleta não completou o mínimo
	 * e ampliou a busca); ausente nas coletas antigas.
	 */
	datePosted: string | null
}

type ScraperRunDocument = {
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: Date
	finishedAt: Date | null
	/**
	 * O sinal de vida da coleta, gravado no início, a cada termo terminado e a cada `RUN_HEARTBEAT_MS`: o último momento
	 * em que se sabe que ela rodava, o fim da coleta interrompida; ausente nas coletas antigas.
	 */
	progressAt: Date | null
	/** Os termos que a coleta vai buscar, na ordem; ausente nas coletas antigas. */
	plannedTerms: string[]
	/** O mínimo de vagas que a coleta procurou; `null` nas coletas antigas. */
	minJobs: number | null
	/** Quantas vagas faltaram para o mínimo quando as buscas acabaram (0 se completou); `null` nas coletas antigas. */
	missingJobs: number | null
	/**
	 * Listas de vagas da coleta que não foram abertas porque o mínimo já estava completo: saíram de `seen_posts` e
	 * podem aparecer de novo em outra busca.
	 */
	deferredLists: string[]
	/** O resultado de cada termo, gravado assim que ele termina (o site acompanha a coleta em andamento). */
	terms: ScraperRunTerm[]
	sent: number
	error: string | null
	/** O motivo, quando a coleta parou no login; `null` nas outras falhas e nas coletas antigas. */
	loginFailure: ScraperLoginFailure | null
}

const HISTORY_DAYS = 90

/** De quanto em quanto tempo a coleta em andamento grava o `progressAt`. */
export const RUN_HEARTBEAT_MS = 30_000

/**
 * Sem sinal de vida por esse tempo, a coleta em andamento foi interrompida (o scraper ou o MongoDB caiu): o site já a
 * mostra assim antes de o scraper voltar e marcá-la (`markInterruptedRuns`). Folga de 4 sinais perdidos.
 */
export const RUN_STALE_MS = 4 * RUN_HEARTBEAT_MS

export const INTERRUPTED_RUN_ERROR = 'Coleta interrompida (o serviço ou o banco de dados caiu no meio)'

/** A coleta em andamento com sinal de vida recente; as sem `progressAt` (antigas) contam como interrompidas. */
export function liveRunFilter(now = new Date()) {
	return { status: 'running' as const, progressAt: { $gte: new Date(now.getTime() - RUN_STALE_MS) } }
}

/** Histórico das coletas: status da coleta em andamento, última coleta e próxima agendada. */
const scraperRunSchema = new Schema<ScraperRunDocument>(
	{
		trigger: { type: String, enum: SCRAPER_RUN_TRIGGERS, required: true },
		status: { type: String, enum: SCRAPER_RUN_STATUSES, required: true },
		startedAt: { type: Date, required: true },
		finishedAt: { type: Date, default: null },
		progressAt: { type: Date, default: null },
		plannedTerms: { type: [String], default: [] },
		minJobs: { type: Number, default: null },
		missingJobs: { type: Number, default: null },
		deferredLists: { type: [String], default: [] },
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
					datePosted: { type: String, default: null },
					_id: false,
				},
			],
			default: [],
		},
		sent: { type: Number, default: 0 },
		error: { type: String, default: null },
		loginFailure: { type: String, enum: [...SCRAPER_LOGIN_FAILURES, null], default: null },
	},
	{ versionKey: false },
)

// Mais recentes primeiro; o MongoDB apaga sozinho as coletas com mais de 90 dias
scraperRunSchema.index({ startedAt: -1 }, { expireAfterSeconds: HISTORY_DAYS * 24 * 60 * 60 })

export const ScraperRun = mongoose.model('ScraperRun', scraperRunSchema, 'scraper_runs')

/**
 * Se a instalação ainda não coletou nada (nenhuma coleta no histórico nem vaga salva). Numa instalação nova, a primeira
 * coleta espera o fim do onboarding ("fazer a primeira coleta") em vez de começar assim que há termos e conta.
 */
export async function neverCollected() {
	const [run, job] = await Promise.all([ScraperRun.exists({}), Job.exists({})])
	return !run && !job
}

/** Coletas terminadas que o intervalo olha para saber se as buscas estão esgotadas (ver `intervalStretch`). */
const STRETCH_LOOKBACK = 2

/**
 * Quantas das coletas mais recentes terminaram seguidas abaixo do mínimo de vagas (as buscas acabaram antes). As
 * coletas com falha não contam nem interrompem a sequência.
 */
export async function consecutiveShortRuns() {
	const runs = await ScraperRun.find({ status: 'success' }, { missingJobs: 1 }).sort({ startedAt: -1 }).limit(STRETCH_LOOKBACK).lean()
	const firstComplete = runs.findIndex(run => !run.missingJobs)

	return firstComplete === -1 ? runs.length : firstComplete
}
