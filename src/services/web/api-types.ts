/**
 * Formatos das respostas da API do site, compartilhados entre o servidor e o navegador (só tipos: nada daqui
 * vai para o bundle do cliente).
 */
import type { PostProcessingSettings, ProcessedJob, ScraperSettings, SettingsKey } from '@shared/contracts'
import type { ScraperRunStatus, ScraperRunTerm, ScraperRunTrigger } from '@shared/database'

/** Vaga salva: o cargo nunca falta (o storage descarta as que vêm sem) e `createdAt` é quando entrou no sistema. */
export type WebJob = Omit<ProcessedJob, 'title'> & { title: string; createdAt: string }

export type JobsPage = { jobs: WebJob[]; nextCursor: string | null }

export type JobFacets = {
	total: number
	/** Quantidade por modalidade; `none` são as vagas sem modalidade. */
	workModes: Record<NonNullable<ProcessedJob['workMode']> | 'none', number>
	skills: { name: string; count: number }[]
}

export const CV_STATUSES = ['pending', 'ready', 'failed'] as const
export type CvStatus = (typeof CV_STATUSES)[number]

/** Pedido de currículo feito pelo site (sem o PDF, baixado à parte em `/api/cv/:requestId/pdf`). */
export type WebCvRequest = {
	requestId: string
	postId: string
	jobTitle: string | null
	company: string | null
	status: CvStatus
	fileName: string | null
	error: string | null
	requestedAt: string
	finishedAt: string | null
}

export type WebScraperRun = {
	id: string
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: string
	finishedAt: string | null
	sent: number
	terms: ScraperRunTerm[]
	error: string | null
}

export type ScraperStatus = {
	/** Coleta em andamento, se houver. */
	current: WebScraperRun | null
	/** Última coleta terminada (sucesso ou falha). */
	last: WebScraperRun | null
	/** Próxima coleta automática; `null` com as coletas pausadas. */
	nextRunAt: string | null
	paused: boolean
	intervalMinutes: number
}

export type RunsPage = { runs: WebScraperRun[]; nextCursor: string | null }

export type WebSettings = { scraper: ScraperSettings; 'post-processing': PostProcessingSettings }
export type { SettingsKey }

/** Erro da API; em erros de validação, `fields` traz a mensagem de cada campo (caminho com pontos, ex.: "searchTerms.0.term"). */
export type ApiError = { error: string; fields?: Record<string, string> }

/** Eventos do stream SSE (`/api/jobs/stream`). */
export type StreamEvents = { job: WebJob; cv: WebCvRequest }
