import { z } from 'zod'

import { BASE_LOCALE, LOCALE_CODES, localeForLanguage, message, t, type Locale } from '../i18n'
import {
	BUILT_IN_VARIABLES,
	defaultTemplate,
	OPTIONAL_VARIABLE_NAMES,
	TEMPLATE_VARIABLE_TYPES,
	templateTokens,
	templateVariables,
	VARIABLE_NAME,
	type TemplateVariable,
} from '../templates/message-template'
import { normalizeCompany } from './company'

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
		...message(m => m.validation.duplicateSearchTerms),
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

export const MAX_BLOCKED_COMPANIES = 200
/** O mesmo limite da empresa corrigida pelo site. */
const MAX_COMPANY_LENGTH = 200

export const PostProcessingSettingsSchema = z.object({
	/**
	 * Porcentagem dos checks da extração (campos em que a IA citou o que não está no post, e a empresa que ficou sem nome)
	 * a partir da qual a vaga pede para conferir o post original e reportar. 60% = 4 de 6.
	 */
	reviewChecksPercent: z.number().int().min(1).max(100).default(60),

	/** Idiomas aceitos (ISO 639-1, ex.: "pt", "en"), detectados no texto do post; lista vazia aceita todos. */
	allowedLanguages: z
		.array(
			z
				.string()
				.trim()
				.toLowerCase()
				.regex(
					/^[a-z]{2}$/,
					message(m => m.validation.isoLanguage),
				),
		)
		.max(20)
		.default(['pt'])
		.transform(languages => [...new Set(languages)]),

	/** A vaga precisa citar ao menos uma destas palavras no cargo ou nos conhecimentos; lista vazia desliga o filtro. */
	requiredKeywords: keywordList,

	/** A vaga é descartada se citar alguma destas palavras no cargo ou nos conhecimentos. */
	excludedKeywords: keywordList,

	/**
	 * Vagas destas empresas são descartadas na coleta, sem salvar nem anunciar (ver `blockingCompany`). Cada empresa fica
	 * escrita como aparecia na vaga; a mesma empresa com outra grafia ou sufixo ("Acme Ltda." e "ACME") conta uma vez.
	 */
	blockedCompanies: z
		.array(z.string().trim().min(1).max(MAX_COMPANY_LENGTH))
		.max(MAX_BLOCKED_COMPANIES)
		.default([])
		.transform(companies => {
			const seen = new Set<string>()
			return companies.filter(company => {
				const name = normalizeCompany(company)
				if (!name || seen.has(name)) return false
				seen.add(name)
				return true
			})
		}),

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
	area: z
		.string()
		.trim()
		.min(
			1,
			message(m => m.validation.areaRequired),
		)
		.max(80)
		.optional(),

	/** O cargo procurado (ex.: "Analista de Marketing Digital"). */
	targetRole: z
		.string()
		.trim()
		.min(
			1,
			message(m => m.validation.targetRoleRequired),
		)
		.max(100)
		.optional(),

	seniority: z.enum(SENIORITY_LEVELS).nullable().default(null),

	/** Idiomas em que a pessoa trabalha (ISO 639-1, ex.: "pt", "en"). */
	languages: z
		.array(
			z
				.string()
				.trim()
				.toLowerCase()
				.regex(
					/^[a-z]{2}$/,
					message(m => m.validation.isoLanguage),
				),
		)
		.min(
			1,
			message(m => m.validation.languagesRequired),
		)
		.max(MAX_PROFILE_LANGUAGES)
		.default(['pt'])
		.transform(languages => [...new Set(languages)]),
})

export type ProfileSettings = z.output<typeof ProfileSettingsSchema>

/** Se o perfil tem o mínimo para os serviços e o onboarding deixarem de supor a área (área e cargo-alvo). */
export function isProfileComplete(profile: ProfileSettings) {
	return !!profile.area && !!profile.targetRole
}

/** Tons do "melhorar com a IA" da mensagem de candidatura. */
export const MESSAGE_TONES = ['formal', 'neutral', 'casual'] as const
export type MessageTone = (typeof MESSAGE_TONES)[number]

/** `short`: poucas frases, para mensagem direta no LinkedIn. `medium`: o e-mail completo. */
export const MESSAGE_LENGTHS = ['short', 'medium'] as const
export type MessageLength = (typeof MESSAGE_LENGTHS)[number]

export const MESSAGE_SUBJECT_MAX = 200
export const MESSAGE_TEMPLATE_MAX = 3000
export const MAX_OWN_VARIABLES = 20
export const OWN_VARIABLE_LIMITS = { name: 40, description: 60, value: 300 } as const
export const FALLBACK_MAX = 100

const OwnVariableSchema = z.object({
	name: z
		.string()
		.trim()
		.min(
			1,
			message(m => m.validation.variableNameRequired),
		)
		.max(
			OWN_VARIABLE_LIMITS.name,
			message(m => m.validation.maxChars(OWN_VARIABLE_LIMITS.name)),
		)
		.regex(
			VARIABLE_NAME,
			message(m => m.validation.variableNameFormat),
		),
	description: z
		.string()
		.trim()
		.max(
			OWN_VARIABLE_LIMITS.description,
			message(m => m.validation.maxChars(OWN_VARIABLE_LIMITS.description)),
		)
		.default(''),
	type: z.enum(TEMPLATE_VARIABLE_TYPES).default('text'),
	value: z
		.string()
		.trim()
		.min(
			1,
			message(m => m.validation.valueRequired),
		)
		.max(
			OWN_VARIABLE_LIMITS.value,
			message(m => m.validation.maxChars(OWN_VARIABLE_LIMITS.value)),
		),
})

const HTTP_LINK = /^https?:\/\/[^\s/$.?#][^\s]*$/i

/**
 * A assinatura de antes (linhas coladas no fim de toda mensagem) vai para o fim do modelo, onde a pessoa pode editá-la ou
 * trocá-la por variáveis de link. Só age enquanto ela estiver salva: o próximo salvar grava o modelo já com ela e sem o
 * campo, e uma assinatura que o modelo já tem não entra de novo.
 */
function moveSignatureToTemplate(values: unknown) {
	if (!values || typeof values !== 'object' || !('signature' in values)) return values

	const { signature, ...rest } = values as { signature?: unknown; template?: { subject?: unknown; body?: unknown } }
	const footer = typeof signature === 'string' ? signature.trim() : ''
	const template = { ...defaultTemplate(), ...rest.template }
	if (!footer || typeof template.body !== 'string' || template.body.includes(footer)) return rest

	return { ...rest, template: { ...template, body: `${template.body.trimEnd()}\n\n${footer}` } }
}

/**
 * A mensagem de candidatura: o modelo da pessoa, preenchido na hora com os dados da vaga. A IA só entra quando a pessoa
 * pede, na vaga ("melhorar com a IA"). Os campos do estilo da IA de antes (`mode`, `tone`, `length`, `styleSample`) que
 * ainda estejam salvos são ignorados, e a assinatura de antes vai para o fim do modelo (`moveSignatureToTemplate`).
 */
const MessageSettingsObject = z
	.object({
		/** O modelo, com variáveis (`{{empresa}}`): a mensagem de toda vaga sai dele. */
		template: z
			.object({
				subject: z
					.string()
					.trim()
					.min(
						1,
						message(m => m.validation.subjectRequired),
					)
					.max(
						MESSAGE_SUBJECT_MAX,
						message(m => m.validation.maxChars(MESSAGE_SUBJECT_MAX)),
					),
				body: z
					.string()
					.trim()
					.min(
						1,
						message(m => m.validation.bodyRequired),
					)
					.max(
						MESSAGE_TEMPLATE_MAX,
						message(m => m.validation.maxChars(MESSAGE_TEMPLATE_MAX)),
					),
			})
			.default(() => defaultTemplate()),
		/** As variáveis da pessoa (`{{meu_nome}}`, `{{link_github}}`), com um valor fixo. */
		variables: z
			.array(OwnVariableSchema)
			.max(
				MAX_OWN_VARIABLES,
				message(m => m.validation.maxVariables(MAX_OWN_VARIABLES)),
			)
			.default([]),
		/** O texto usado quando a vaga não tem o valor de uma variável que pode faltar (`empresa` → "a sua empresa"). */
		fallbacks: z
			.record(
				z.string(),
				z
					.string()
					.trim()
					.min(
						1,
						message(m => m.validation.fallbackRequired),
					)
					.max(
						FALLBACK_MAX,
						message(m => m.validation.maxChars(FALLBACK_MAX)),
					),
			)
			.default({}),
	})
	.superRefine((settings, ctx) => {
		const builtIn = new Set(BUILT_IN_VARIABLES.map(variable => variable.name))
		const seen = new Set<string>()

		settings.variables.forEach((variable, index) => {
			if (builtIn.has(variable.name)) {
				ctx.addIssue({
					code: 'custom',
					path: ['variables', index, 'name'],
					message: t().validation.builtInVariable(variable.name),
				})
			} else if (seen.has(variable.name)) {
				ctx.addIssue({ code: 'custom', path: ['variables', index, 'name'], message: t().validation.duplicateVariable })
			}
			seen.add(variable.name)

			if (variable.type === 'link' && !HTTP_LINK.test(variable.value)) {
				ctx.addIssue({
					code: 'custom',
					path: ['variables', index, 'value'],
					message: t().validation.linkVariable,
				})
			}
		})

		for (const name of Object.keys(settings.fallbacks)) {
			if (!OPTIONAL_VARIABLE_NAMES.includes(name)) {
				ctx.addIssue({ code: 'custom', path: ['fallbacks', name], message: t().validation.fallbackNeverMissing(name) })
			}
		}

		const variables = new Map(templateVariables(settings.variables).map(variable => [variable.name, variable]))
		for (const field of ['subject', 'body'] as const) {
			const problem = templateProblem(settings.template[field], field, variables)
			if (problem) ctx.addIssue({ code: 'custom', path: ['template', field], message: problem })
		}
	})

export const MessageSettingsSchema = z.preprocess(moveSignatureToTemplate, MessageSettingsObject)

export type MessageSettings = z.output<typeof MessageSettingsSchema>

/** O primeiro problema das variáveis escritas no assunto ou na mensagem do modelo, ou `null`. */
function templateProblem(text: string, field: 'subject' | 'body', variables: Map<string, TemplateVariable>) {
	for (const token of templateTokens(text)) {
		const variable = variables.get(token.name)
		if (!variable) {
			return token.name ? t().validation.unknownVariable(token.name) : t().validation.unnamedVariable
		}
		if (field === 'subject' && variable.type === 'link') {
			return t().validation.linkInSubject(token.name)
		}
		if (token.fallback === '') {
			return t().validation.emptyFallback(token.name)
		}
	}

	return null
}

/**
 * O idioma da candidatura (o currículo ajustado e a mensagem melhorada pela IA). `system`: sempre o idioma do sistema.
 * `job`: o idioma detectado do post.
 */
export const CV_LANGUAGE_MODES = ['system', 'job'] as const
export type CvLanguageMode = (typeof CV_LANGUAGE_MODES)[number]

/**
 * O idioma do sistema (site, Discord e validação) e o da candidatura. Não se confunde com os idiomas do perfil
 * (`profile.languages`) nem com os aceitos nos posts (`allowedLanguages`).
 */
export const LanguageSettingsSchema = z.object({
	/**
	 * `null`: ainda não escolhido. O site usa o do navegador e o salva; os outros serviços, o `pt-BR`. Um idioma que
	 * deixou de existir volta a `null`.
	 */
	locale: z.enum(LOCALE_CODES).nullable().default(null).catch(null),
	cvLanguage: z.enum(CV_LANGUAGE_MODES).default('system'),
})

export type LanguageSettings = z.output<typeof LanguageSettingsSchema>

/** O idioma do sistema salvo, ou o `pt-BR` enquanto ninguém escolheu. */
export function systemLocale(settings: Pick<LanguageSettings, 'locale'>) {
	return settings.locale ?? BASE_LOCALE
}

/**
 * O idioma do currículo ajustado de uma vaga, resolvido uma vez por vaga: com `job`, o do post, se o sistema tiver o
 * idioma (`source: 'job'`); sem idioma detectado ou sem tradução para ele, o do sistema.
 */
export function cvLocaleFor(
	settings: LanguageSettings,
	jobLanguage: string | null | undefined,
): { locale: Locale; source: CvLanguageMode } {
	const fromJob = settings.cvLanguage === 'job' && jobLanguage ? localeForLanguage(jobLanguage) : null
	return fromJob ? { locale: fromJob, source: 'job' } : { locale: systemLocale(settings), source: 'system' }
}

/** Schema de cada documento da coleção `settings`, pelo `_id`. */
export const SETTINGS_SCHEMAS = {
	scraper: ScraperSettingsSchema,
	'post-processing': PostProcessingSettingsSchema,
	profile: ProfileSettingsSchema,
	message: MessageSettingsSchema,
	language: LanguageSettingsSchema,
} as const

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS
export type SettingsOf<K extends SettingsKey> = z.output<(typeof SETTINGS_SCHEMAS)[K]>
export type SettingsInput<K extends SettingsKey> = z.input<(typeof SETTINGS_SCHEMAS)[K]>

/**
 * Credenciais das contas usadas pelos serviços, informadas pelo site (documento `credentials` da coleção `settings`)
 * ou pelo `.env`. Cada grupo vale por inteiro: o do banco, se existir; senão, o do `.env`.
 */
export const LinkedinCredentialsSchema = z.object({
	email: z
		.string(message(m => m.validation.emailRequired))
		.trim()
		.pipe(z.email(message(m => m.validation.emailInvalid))),
	password: z.string(message(m => m.validation.passwordRequired)).min(
		1,
		message(m => m.validation.passwordRequired),
	),
	/** Cookie `li_at` de uma sessão já logada, usado enquanto o scraper não tem uma sessão salva. */
	liAt: z.string().trim().min(1).optional(),
})

export const DiscordCredentialsSchema = z.object({
	token: z
		.string(message(m => m.validation.botTokenRequired))
		.trim()
		.min(
			1,
			message(m => m.validation.botTokenRequired),
		),
	channelId: z
		.string(message(m => m.validation.channelIdRequired))
		.trim()
		.regex(
			/^\d+$/,
			message(m => m.validation.channelIdFormat),
		),
})

export const GithubCredentialsSchema = z.object({
	username: z
		.string(message(m => m.validation.userRequired))
		.trim()
		.min(
			1,
			message(m => m.validation.userRequired),
		)
		.max(39)
		.regex(
			/^[a-z\d][a-z\d-]*$/i,
			message(m => m.validation.githubUserFormat),
		),
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
				.regex(
					/^[a-z\d.-]+$/i,
					message(m => m.validation.smtpHostFormat),
				),
		),
		/** Opcional: sem porta, vale a 587. Texto, como os outros campos do formulário. */
		port: emptyAsUndefined(
			z
				.string()
				.trim()
				.regex(
					/^\d{1,5}$/,
					message(m => m.validation.smtpPortFormat),
				)
				.refine(
					port => Number(port) >= 1 && Number(port) <= 65_535,
					message(m => m.validation.smtpPortRange),
				),
		),
		user: z
			.string(message(m => m.validation.userRequired))
			.trim()
			.min(
				1,
				message(m => m.validation.smtpUserRequired),
			),
		password: z.string(message(m => m.validation.passwordRequired)).min(
			1,
			message(m => m.validation.smtpPasswordRequired),
		),
		/**
		 * Opcional: o remetente ("Nome <email>" ou só o e-mail); sem ele, o nome do currículo base com o `user`
		 * (`senderOf`, no mailer).
		 */
		from: emptyAsUndefined(
			z
				.string()
				.trim()
				.max(
					200,
					message(m => m.validation.maxChars(200)),
				),
		),
	})
	.superRefine((account, ctx) => {
		if (account.host || smtpHostFor(account.user)) return

		const domain = account.user.split('@')[1]
		ctx.addIssue({
			code: 'custom',
			path: ['host'],
			message: isMicrosoftPersonalAccount(account)
				? t().validation.smtpHostMicrosoft(domain ?? '')
				: domain
					? t().validation.smtpHostUnknown(domain)
					: t().validation.smtpHostMissing,
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
