/**
 * Formatos das respostas da API do site, compartilhados entre o servidor e o navegador (só tipos: nada daqui
 * vai para o bundle do cliente).
 */
import type {
	ApplicationMessage,
	ContractType,
	PostProcessingSettings,
	ProcessedJob,
	ProfileSettings,
	ScraperSettings,
	SettingsKey,
} from '@shared/contracts'
import type { CvBaseStatus, ScraperRunStatus, ScraperRunTrigger, ScraperTermErrorKind, SeenPostOutcome } from '@shared/database'

/**
 * Vaga salva: o cargo nunca falta (o post-processing descarta as que vêm sem), `createdAt` é quando entrou no sistema
 * `correctedAt`, quando foi corrigida pelo site pela última vez (`null` se nunca foi) e `viewedAt`, quando foi aberta
 * no site (`null` se ainda não foi vista).
 */
export type WebJob = Omit<ProcessedJob, 'title'> & {
	title: string
	createdAt: string
	correctedAt: string | null
	viewedAt: string | null
}

export type JobsPage = { jobs: WebJob[]; nextCursor: string | null }

export type JobFacets = {
	total: number
	/** Vagas ainda não abertas no site. */
	unviewed: number
	/** Quantidade por modalidade; `none` são as vagas sem modalidade. */
	workModes: Record<NonNullable<ProcessedJob['workMode']> | 'none', number>
	/** Quantidade por regime (uma vaga com dois regimes conta nos dois); `none` são as vagas sem regime. */
	contractTypes: Record<ContractType | 'none', number>
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
	/** E-mail de candidatura gerado pela IA para a vaga (só com e-mail de contato e resposta válida da IA). */
	message: ApplicationMessage | null
	requestedAt: string
	finishedAt: string | null
}

/** Versão do currículo base (sem o `.tex` nem o PDF, buscados à parte). */
export type WebCvBaseVersion = {
	versionId: string
	/** Nome do arquivo enviado; `null` quando o texto foi escrito ou editado no site. */
	fileName: string | null
	status: CvBaseStatus
	/** Por que foi recusada; vazio enquanto valida e nas válidas. */
	errors: string[]
	pages: number | null
	/** Tamanho do `.tex` em bytes. */
	size: number
	createdAt: string
	validatedAt: string | null
	/** Última vez que virou o currículo base; a ativa é a de data mais recente. */
	activatedAt: string | null
	/** Quando some do histórico por nunca ter sido ativada; `null` nas que já foram ativadas. */
	expiresAt: string | null
}

/** A versão com o `.tex`, para editar a partir dela. */
export type WebCvBaseVersionWithTex = WebCvBaseVersion & { tex: string }

/** Versões do currículo base, das mais novas às mais antigas (a ativa sempre vem, mesmo se for antiga). */
export type WebCvBase = { versions: WebCvBaseVersion[] }

export type WebScraperRun = {
	id: string
	trigger: ScraperRunTrigger
	status: ScraperRunStatus
	startedAt: string
	finishedAt: string | null
	/** Posts novos enviados para a IA. */
	sent: number
	/** Posts da busca que já tinham passado pela IA (não enviados de novo). */
	skipped: number
	/** Posts novos em um idioma fora dos aceitos, ignorados na coleta (não vão para a IA nem contam no limite). */
	otherLanguage: number
	/**
	 * Vagas salvas a partir dos posts da coleta (cresce enquanto a IA processa a fila); `null` nas coletas antigas,
	 * que não guardavam os posts enviados.
	 */
	newJobs: number | null
	/**
	 * O que o post-processing fez com os posts enviados (vaga salva ou o motivo do descarte) e quantos ainda estão na
	 * fila; `null` nas coletas antigas.
	 */
	outcomes: { counts: Partial<Record<SeenPostOutcome | 'unknown', number>>; pending: number } | null
	terms: WebScraperRunTerm[]
	error: string | null
}

export type WebScraperRunTerm = {
	term: string
	sent: number
	skipped: number
	otherLanguage: number
	error: string | null
	/** Por que a busca não trouxe posts (`empty` não é falha); `null` se deu certo. */
	errorKind: ScraperTermErrorKind | null
	/** A busca aberta no LinkedIn; `null` nas coletas antigas. */
	searchUrl: string | null
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

export type WebSettings = { scraper: ScraperSettings; 'post-processing': PostProcessingSettings; profile: ProfileSettings }
export type { SettingsKey }

/** Erro da API; em erros de validação, `fields` traz a mensagem de cada campo (caminho com pontos, ex.: "searchTerms.0.term"). */
export type ApiError = { error: string; fields?: Record<string, string> }

/** Vagas marcadas como vistas (`viewedAt` com a data) ou como não vistas (`viewedAt: null`). */
export type JobsViewedChange = { postIds: string[]; viewedAt: string | null }

/**
 * Eventos do stream SSE (`/api/jobs/stream`): `viewed` leva a marcação de vista às outras abas e aparelhos; `cvBase`,
 * uma versão do currículo base criada, validada ou ativada.
 */
export type StreamEvents = { job: WebJob; cv: WebCvRequest; viewed: JobsViewedChange; cvBase: WebCvBaseVersion }
