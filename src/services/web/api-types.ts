/**
 * Formatos das respostas da API do site, compartilhados entre o servidor e o navegador (só tipos: nada daqui
 * vai para o bundle do cliente).
 */
import type {
	ApplicationMessage,
	ContractType,
	CredentialGroup,
	CredentialsStatus,
	CvForm,
	PostProcessingSettings,
	ProcessedJob,
	ProfileSettings,
	ScraperSettings,
	SettingsKey,
} from '@shared/contracts'
import type {
	CvBaseStatus,
	LinkedinChallenge,
	LinkedinLoginStatus,
	ScraperRunStatus,
	ScraperRunTrigger,
	ScraperTermErrorKind,
	SeenPostOutcome,
} from '@shared/database'

/** Vaga preparada para ser exibida pelo site. */
export type WebJob = Omit<ProcessedJob, 'title'> & {
	/** O cargo nunca falta: o post-processing descarta as vagas que vêm sem. */
	title: string
	/** Quando a vaga entrou no sistema. */
	createdAt: string
	/** Quando a vaga foi corrigida pelo site pela última vez; `null` se nunca foi. */
	correctedAt: string | null
	/** Quando a vaga foi aberta no site; `null` se ainda não foi vista. */
	viewedAt: string | null
	/** Se há checks da extração suficientes para pedir que a pessoa confira o post original. */
	needsReview: boolean
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
	/** Nome do arquivo enviado; `null` quando o texto foi escrito ou editado no site, ou veio do formulário. */
	fileName: string | null
	/** Gerada pelo formulário do site (`form` em `WebCvBaseVersionWithTex`). */
	fromForm: boolean
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

/** A versão com o `.tex` (e os dados do formulário, quando veio dele), para editar a partir dela. */
export type WebCvBaseVersionWithTex = WebCvBaseVersion & { tex: string; form: CvForm | null }

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
	/** Próxima coleta automática; `null` com as coletas pausadas, sem termos de busca ativos ou sem conta do LinkedIn. */
	nextRunAt: string | null
	paused: boolean
	intervalMinutes: number
	/** Quantos termos de busca estão ativos; com 0, o scraper fica em espera até a pessoa configurar. */
	activeSearchTerms: number
	/** Se há conta do LinkedIn (site ou `.env`); sem ela, o scraper fica em espera até a pessoa conectar. */
	linkedinAccount: boolean
}

/** Os passos do onboarding que têm o que configurar (a revisão, no fim, não tem). */
export const SETUP_STEPS = ['profile', 'linkedin', 'cv', 'discord', 'github'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** O mínimo para começar: sem um deles, o site abre o onboarding. Discord e GitHub são opcionais. */
export const REQUIRED_SETUP_STEPS = ['profile', 'linkedin', 'cv'] as const satisfies readonly SetupStep[]

/** `GET /api/setup`: se o onboarding deve abrir e o que já está configurado (pelo `.env` ou pelo site). */
export type SetupStatus = {
	/** `SKIP_ONBOARDING` do `.env`: com `true`, o site não abre o onboarding (só avisa o que falta). */
	skipOnboarding: boolean
	/**
	 * O que já está configurado: `profile` é área e cargo-alvo com pelo menos um termo de busca ativo; `cv`, uma versão
	 * ativa do currículo base ou o arquivo `CV_TEX_FILE`; as contas, salvas no site ou no `.env`.
	 */
	steps: Record<SetupStep, boolean>
	/** Todos os `REQUIRED_SETUP_STEPS` configurados. */
	ready: boolean
}

/** `POST /api/setup/suggestions`: termos e palavras-chave sugeridos para revisar; `fromAi: false` se a IA falhou. */
export type SearchSuggestions = { searchTerms: string[]; requiredKeywords: string[]; excludedKeywords: string[]; fromAi: boolean }

/** `GET /api/linkedin/login`: o login do LinkedIn em andamento ou o último (`null` se nunca houve um). */
export type LinkedinLoginState = {
	status: LinkedinLoginStatus
	/** A verificação pedida pelo LinkedIn, com `status: 'verification'`. */
	challenge: LinkedinChallenge | null
	/** O QR code da verificação, já em SVG. */
	qrSvg: string | null
	message: string | null
	/** Quando o site pediu o teste; `null` nos logins das coletas. */
	requestedAt: string | null
	updatedAt: string
}

/** Tamanhos de página que o histórico de coletas aceita. */
export const RUNS_PAGE_SIZES = [10, 20, 50, 100] as const
export type RunsPageSize = (typeof RUNS_PAGE_SIZES)[number]

/** Uma página do histórico de coletas; `total` é de todas as páginas. */
export type RunsPage = { runs: WebScraperRun[]; total: number }

export type WebSettings = { scraper: ScraperSettings; 'post-processing': PostProcessingSettings; profile: ProfileSettings }
export type { SettingsKey }

/** `GET /api/credentials`: de onde vem cada grupo e os campos públicos; os segredos nunca vêm, só se estão preenchidos. */
export type WebCredentials = CredentialsStatus
export type { CredentialGroup }

/** Resultado de `POST /api/credentials/:group/test`: se o serviço aceitou as credenciais, e o que ele respondeu. */
export type CredentialCheck = { ok: boolean; message: string }

/** Erro da API; em erros de validação, `fields` traz a mensagem de cada campo (caminho com pontos, ex.: "searchTerms.0.term"). */
export type ApiError = { error: string; fields?: Record<string, string> }

/** Vagas marcadas como vistas (`viewedAt` com a data) ou como não vistas (`viewedAt: null`). */
export type JobsViewedChange = { postIds: string[]; viewedAt: string | null }

/**
 * Eventos do stream SSE (`/api/jobs/stream`): `viewed` leva a marcação de vista às outras abas e aparelhos; `cvBase`,
 * uma versão do currículo base criada, validada ou ativada.
 */
export type StreamEvents = { job: WebJob; cv: WebCvRequest; viewed: JobsViewedChange; cvBase: WebCvBaseVersion }
