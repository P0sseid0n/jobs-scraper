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
		/**
		 * Cada termo ativo vira uma busca no LinkedIn, em sequência, na mesma coleta. Nasce vazio (o onboarding preenche):
		 * sem nenhum termo ativo, o scraper fica em espera.
		 */
		searchTerms: z.array(SearchTermSchema).max(MAX_SEARCH_TERMS).default([]),

		datePosted: z.enum(DATE_POSTED_FILTERS).default('past-24h'),

		/**
		 * Vagas novas que a coleta procura (somando todos os termos): ela só para antes disso quando as buscas não têm
		 * mais o que trazer. Posts descartados pela IA e listas de vagas não contam.
		 */
		minJobsPerRun: z.number().int().min(1).max(50).default(10),

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
	.refine(settings => new Set(settings.searchTerms.map(term => term.term.toLowerCase())).size === settings.searchTerms.length, {
		message: 'Há termos de busca repetidos',
		path: ['searchTerms'],
	})

export type ScraperSettings = z.output<typeof ScraperSettingsSchema>

/** Os termos que viram busca na coleta; lista vazia = o scraper fica em espera até a pessoa configurar. */
export function activeSearchTerms(settings: Pick<ScraperSettings, 'searchTerms'>) {
	return settings.searchTerms.filter(term => term.enabled).map(term => term.term)
}

/** Lista de palavras-chave sem repetidos (a comparação ignora caixa, acentos, hífen e ".js"). */
const keywordList = z
	.array(z.string().trim().min(1).max(50))
	.max(50)
	.default([])
	.transform(keywords => [...new Set(keywords.map(keyword => keyword.toLowerCase()))])

export const PostProcessingSettingsSchema = z.object({
	/**
	 * Porcentagem dos checks da extração (campos em que a IA citou o que não está no post) a partir da qual a vaga pede
	 * para conferir o post original e reportar. 60% = 4 de 6.
	 */
	reviewChecksPercent: z.number().int().min(1).max(100).default(60),

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

	/**
	 * Semelhança mínima (porcentagem, Jaccard dos trigramas de palavras) entre o texto de dois posts da mesma empresa e
	 * cargo para a vaga nova ser agrupada como repostagem da outra.
	 */
	duplicateSimilarityPercent: z.number().int().min(1).max(100).default(60),

	/** Quantos dias para trás a vaga nova é comparada com as já salvas, procurando a mesma vaga repostada. */
	duplicateWindowDays: z.number().int().min(1).max(365).default(30),
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

/** Tons do e-mail de candidatura escrito pela IA. */
export const MESSAGE_TONES = ['formal', 'neutral', 'casual'] as const
export type MessageTone = (typeof MESSAGE_TONES)[number]

/** `short`: poucas frases, para mensagem direta no LinkedIn. `medium`: o e-mail completo. */
export const MESSAGE_LENGTHS = ['short', 'medium'] as const
export type MessageLength = (typeof MESSAGE_LENGTHS)[number]

/** O tom padrão pode ser `auto`: a IA escolhe pelo post (formal num banco, descontraído numa startup). */
export const MESSAGE_DEFAULT_TONES = ['auto', ...MESSAGE_TONES] as const
export type MessageDefaultTone = (typeof MESSAGE_DEFAULT_TONES)[number]

export const MESSAGE_STYLE_SAMPLE_MAX = 1500
export const MESSAGE_SIGNATURE_MAX = 500

/** Como a IA escreve o e-mail de candidatura (cv-updater); em cada vaga dá para reescrever com outro tom e tamanho. */
export const MessageSettingsSchema = z.object({
	tone: z.enum(MESSAGE_DEFAULT_TONES).default('neutral'),
	length: z.enum(MESSAGE_LENGTHS).default('medium'),
	/** Uma mensagem que a pessoa já mandou: a IA imita o jeito de escrever, sem copiar os fatos. Vazio desliga. */
	styleSample: z.string().trim().max(MESSAGE_STYLE_SAMPLE_MAX).default(''),
	/** Linhas coladas no fim de toda mensagem, como estão, sem passar pela IA (ex.: links do GitHub e do LinkedIn). */
	signature: z.string().trim().max(MESSAGE_SIGNATURE_MAX).default(''),
})

export type MessageSettings = z.output<typeof MessageSettingsSchema>

/** Schema de cada documento da coleção `settings`, pelo `_id`. */
export const SETTINGS_SCHEMAS = {
	scraper: ScraperSettingsSchema,
	'post-processing': PostProcessingSettingsSchema,
	profile: ProfileSettingsSchema,
	message: MessageSettingsSchema,
} as const

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS
export type SettingsOf<K extends SettingsKey> = z.output<(typeof SETTINGS_SCHEMAS)[K]>
export type SettingsInput<K extends SettingsKey> = z.input<(typeof SETTINGS_SCHEMAS)[K]>

/**
 * Credenciais das contas usadas pelos serviços, informadas pelo site (documento `credentials` da coleção `settings`)
 * ou pelo `.env`. Cada grupo vale por inteiro: o do banco, se existir; senão, o do `.env`.
 */
export const LinkedinCredentialsSchema = z.object({
	email: z.string('Informe o e-mail').trim().pipe(z.email('Informe um e-mail válido')),
	password: z.string('Informe a senha').min(1, 'Informe a senha'),
	/** Cookie `li_at` de uma sessão já logada, usado enquanto o scraper não tem uma sessão salva. */
	liAt: z.string().trim().min(1).optional(),
})

export const DiscordCredentialsSchema = z.object({
	token: z.string('Informe o token do bot').trim().min(1, 'Informe o token do bot'),
	channelId: z.string('Informe o ID do canal').trim().regex(/^\d+$/, 'Use o ID numérico do canal'),
})

export const GithubCredentialsSchema = z.object({
	username: z
		.string('Informe o usuário')
		.trim()
		.min(1, 'Informe o usuário')
		.max(39)
		.regex(/^[a-z\d][a-z\d-]*$/i, 'Use o nome de usuário do GitHub (letras, números e hífen)'),
	/** Opcional: sem token, a API do GitHub permite só 60 requisições por hora. */
	token: z.string().trim().min(1).optional(),
})

/** Campo opcional do formulário: vazio (`""`) conta como não informado. */
const emptyAsUndefined = <T extends z.ZodType>(schema: T) =>
	z.preprocess(value => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional())

/** Porta padrão do SMTP (STARTTLS); a 465 usa TLS desde a conexão. */
export const SMTP_DEFAULT_PORT = 587

/**
 * O servidor SMTP dos provedores comuns que aceitam senha de app, pelo domínio do e-mail (todos com a 587 e STARTTLS).
 * As contas pessoais da Microsoft ficam de fora: ver `isMicrosoftPersonalAccount`.
 */
export const SMTP_PROVIDER_HOSTS: Record<string, string> = {
	'gmail.com': 'smtp.gmail.com',
	'googlemail.com': 'smtp.gmail.com',
	'yahoo.com': 'smtp.mail.yahoo.com',
	'yahoo.com.br': 'smtp.mail.yahoo.com',
	'ymail.com': 'smtp.mail.yahoo.com',
	'icloud.com': 'smtp.mail.me.com',
	'me.com': 'smtp.mail.me.com',
	'mac.com': 'smtp.mail.me.com',
}

/** Onde criar a senha de app do Gmail (com a verificação em duas etapas ligada). */
export const GMAIL_APP_PASSWORDS_URL = 'https://myaccount.google.com/apppasswords'

/** Os domínios das contas pessoais da Microsoft, e o servidor SMTP delas. */
const MICROSOFT_PERSONAL_DOMAINS = new Set(['outlook.com', 'outlook.com.br', 'hotmail.com', 'hotmail.com.br', 'live.com', 'msn.com'])
const MICROSOFT_PERSONAL_HOST = 'smtp-mail.outlook.com'

/**
 * Conta pessoal da Microsoft (Outlook, Hotmail, Live), pelo domínio do usuário ou pelo servidor: a Microsoft não aceita
 * mais senha, nem senha de app, no SMTP delas (só OAuth2). As do Microsoft 365 de trabalho ou escola, com domínio
 * próprio, não entram aqui: funcionam se o administrador liberar o SMTP AUTH.
 */
export function isMicrosoftPersonalAccount(account: { host?: string; user?: string }) {
	const domain = account.user?.trim().toLowerCase().split('@')[1] ?? ''
	return MICROSOFT_PERSONAL_DOMAINS.has(domain) || account.host?.trim().toLowerCase() === MICROSOFT_PERSONAL_HOST
}

/** O servidor deduzido do usuário (o e-mail da conta); `null` quando o domínio não é de um provedor conhecido. */
export function smtpHostFor(user: string) {
	const domain = user.trim().toLowerCase().split('@')[1]
	return (domain && SMTP_PROVIDER_HOSTS[domain]) || null
}

/** O servidor da conta: o informado ou, sem ele, o deduzido do usuário (a validação garante que um dos dois existe). */
export function smtpHostOf(account: { host?: string; user: string }) {
	return account.host ?? smtpHostFor(account.user) ?? ''
}

/**
 * O servidor SMTP do envio das candidaturas (Gmail e afins, com senha de app). Sem ele, o envio por e-mail
 * fica desligado nos canais. O servidor só é pedido quando o domínio do usuário não é de um provedor conhecido.
 */
export const SmtpCredentialsSchema = z
	.object({
		/** Opcional nos provedores conhecidos: sem ele, vale o deduzido do usuário (`smtpHostOf`). */
		host: emptyAsUndefined(
			z
				.string()
				.trim()
				.regex(/^[a-z\d.-]+$/i, 'Use só o endereço do servidor (ex.: smtp.gmail.com)'),
		),
		/** Opcional: sem porta, vale a 587. Texto, como os outros campos do formulário. */
		port: emptyAsUndefined(
			z
				.string()
				.trim()
				.regex(/^\d{1,5}$/, 'Use o número da porta (ex.: 587 ou 465)')
				.refine(port => Number(port) >= 1 && Number(port) <= 65_535, 'Porta fora do intervalo 1-65535'),
		),
		user: z.string('Informe o usuário').trim().min(1, 'Informe o usuário (em geral, o e-mail)'),
		password: z.string('Informe a senha').min(1, 'Informe a senha (de app, no Gmail)'),
		/**
		 * Opcional: o remetente ("Nome <email>" ou só o e-mail); sem ele, o nome do currículo base com o `user`
		 * (`senderOf`, no mailer).
		 */
		from: emptyAsUndefined(z.string().trim().max(200, 'Use até 200 caracteres')),
	})
	.superRefine((account, ctx) => {
		if (account.host || smtpHostFor(account.user)) return

		const domain = account.user.split('@')[1]
		ctx.addIssue({
			code: 'custom',
			path: ['host'],
			message: isMicrosoftPersonalAccount(account)
				? `Informe o servidor SMTP, mas a Microsoft não aceita senha no SMTP das contas pessoais (${domain}): use uma conta do Gmail`
				: domain
					? `Informe o servidor SMTP: não conheço o de ${domain}`
				: 'Informe o servidor SMTP (ou use o e-mail inteiro no usuário, para ele ser deduzido)',
		})
	})

export const CREDENTIAL_SCHEMAS = {
	linkedin: LinkedinCredentialsSchema,
	discord: DiscordCredentialsSchema,
	github: GithubCredentialsSchema,
	smtp: SmtpCredentialsSchema,
} as const

export const CredentialsSchema = z.object({
	linkedin: LinkedinCredentialsSchema.optional(),
	discord: DiscordCredentialsSchema.optional(),
	github: GithubCredentialsSchema.optional(),
	smtp: SmtpCredentialsSchema.optional(),
})

export type Credentials = z.output<typeof CredentialsSchema>
export type CredentialGroup = keyof typeof CREDENTIAL_SCHEMAS
export type CredentialsOf<G extends CredentialGroup> = z.output<(typeof CREDENTIAL_SCHEMAS)[G]>

export const CREDENTIAL_GROUPS = Object.keys(CREDENTIAL_SCHEMAS) as CredentialGroup[]

/** Os campos que nunca saem do servidor (a API só diz se estão preenchidos); os outros são mostrados no site. */
export const SECRET_FIELDS = {
	linkedin: ['password', 'liAt'],
	discord: ['token'],
	github: ['token'],
	smtp: ['password'],
} as const satisfies { [G in CredentialGroup]: readonly (keyof CredentialsOf<G>)[] }

export type SecretField<G extends CredentialGroup> = (typeof SECRET_FIELDS)[G][number]
export type PublicField<G extends CredentialGroup> = Exclude<keyof CredentialsOf<G> & string, SecretField<G>>

/** De onde vem o grupo em uso: salvo pelo site (`database`) ou lido do `.env` (`env`). */
export type CredentialSource = 'database' | 'env'

/** O estado de um grupo sem os segredos: os campos públicos com o valor e os segredos só como "preenchido ou não". */
export type CredentialStatus<G extends CredentialGroup> = {
	/** `null`: o grupo não está configurado. */
	source: CredentialSource | null
	values: { [F in PublicField<G>]: string | null }
	secrets: { [F in SecretField<G>]: boolean }
}

export type CredentialsStatus = { [G in CredentialGroup]: CredentialStatus<G> }

/**
 * O estado do grupo para mostrar no site. Os segredos viram só `true`/`false`: este é o único formato em que as
 * credenciais saem do servidor.
 */
export function credentialStatus<G extends CredentialGroup>(
	group: G,
	credentials: { value: CredentialsOf<G>; source: CredentialSource } | null,
): CredentialStatus<G> {
	const secretFields: readonly string[] = SECRET_FIELDS[group]
	const fields = Object.keys(CREDENTIAL_SCHEMAS[group].shape)
	const value = (credentials?.value ?? {}) as Record<string, string | undefined>

	return {
		source: credentials?.source ?? null,
		values: Object.fromEntries(fields.filter(field => !secretFields.includes(field)).map(field => [field, value[field] ?? null])),
		secrets: Object.fromEntries(secretFields.map(field => [field, !!value[field]])),
	} as CredentialStatus<G>
}
