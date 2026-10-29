import type { ProcessedJob } from '../contracts/job'

/**
 * O modelo de e-mail de candidatura da própria pessoa, com variáveis como `{{empresa}}` e `{{cargo}}`: a mensagem sai
 * na hora, sem a IA. Usado pelo site (configurações, prévia e modal do contato) e pelo Discord.
 */

/** `text` entra igual no assunto e na mensagem; `link` vira um link na mensagem, por isso não vale no assunto. */
export const TEMPLATE_VARIABLE_TYPES = ['text', 'link'] as const
export type TemplateVariableType = (typeof TEMPLATE_VARIABLE_TYPES)[number]

/** De onde vem o valor: da vaga, do perfil ou das variáveis próprias da pessoa (nas configurações). */
export type TemplateVariableGroup = 'job' | 'profile' | 'own'

export type TemplateVariable = {
	/** Em português, sem acentos, em `snake_case`: entra no modelo como `{{nome}}`. */
	name: string
	/** O que é, em poucas palavras ("Nome da empresa"). */
	description: string
	type: TemplateVariableType
	group: TemplateVariableGroup
	/** A vaga pode não ter o valor (a IA não achou no post): sem fallback, a mensagem fica com um buraco. */
	optional: boolean
}

/** As variáveis da vaga. O cargo nunca falta: o post-processing descarta as vagas sem ele. */
export const JOB_VARIABLES: readonly TemplateVariable[] = [
	{ name: 'cargo', description: 'Título da vaga', type: 'text', group: 'job', optional: false },
	{ name: 'empresa', description: 'Nome da empresa', type: 'text', group: 'job', optional: true },
	{ name: 'local', description: 'Cidade ou região da vaga', type: 'text', group: 'job', optional: true },
	{ name: 'modalidade', description: 'Remoto, híbrido ou presencial', type: 'text', group: 'job', optional: true },
	{ name: 'tecnologias', description: 'O que a vaga pede', type: 'text', group: 'job', optional: true },
	{ name: 'link_da_vaga', description: 'Link da vaga ou do post', type: 'link', group: 'job', optional: true },
	{ name: 'autor_do_post', description: 'Quem publicou a vaga', type: 'text', group: 'job', optional: true },
]

/** As variáveis do perfil (Configurações › Perfil), sempre preenchidas depois do onboarding. */
export const PROFILE_VARIABLES: readonly TemplateVariable[] = [
	{ name: 'area', description: 'Sua área de atuação', type: 'text', group: 'profile', optional: false },
	{ name: 'cargo_alvo', description: 'O cargo que você procura', type: 'text', group: 'profile', optional: false },
]

/** As variáveis prontas, da vaga e do perfil, na ordem do painel "Variáveis disponíveis". */
export const BUILT_IN_VARIABLES: readonly TemplateVariable[] = [...JOB_VARIABLES, ...PROFILE_VARIABLES]

/** As variáveis que podem faltar numa vaga (e por isso aceitam fallback). */
export const OPTIONAL_VARIABLE_NAMES = BUILT_IN_VARIABLES.filter(variable => variable.optional).map(variable => variable.name)

/** Nome de variável: minúsculas sem acento, números e `_` entre as partes (`meu_nome`, `link_github`). */
export const VARIABLE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

/** Uma variável própria, das configurações: o valor é fixo e vale para toda vaga. */
export type OwnVariable = { name: string; description: string; type: TemplateVariableType; value: string }

/** Todas as variáveis que o modelo aceita: as prontas e as próprias da pessoa. */
export function templateVariables(own: readonly OwnVariable[]): TemplateVariable[] {
	return [
		...BUILT_IN_VARIABLES,
		...own.map(({ name, description, type }) => ({ name, description, type, group: 'own' as const, optional: false })),
	]
}

/** O modelo que vem nas configurações: a mesma mensagem do modelo fixo de antes, com as variáveis. */
export const DEFAULT_TEMPLATE = {
	subject: 'Candidatura – {{cargo}}',
	body: [
		'Olá! Tudo bem?',
		'',
		'Vi a publicação sobre {{cargo}} no LinkedIn e tenho interesse na oportunidade.',
		'Envio em anexo meu currículo e fico à disposição para conversarmos.',
		'',
		'Obrigado!',
	].join('\n'),
}

/**
 * Uma variável no texto: `{{nome}}`, com espaços opcionais dentro das chaves (`{{ empresa }}`) e, depois de uma barra, o
 * fallback dela (`{{empresa | a sua empresa}}`). Um `{{` sem fechar não é variável e fica no texto como está.
 */
const VARIABLE = /\{\{\s*([^{}|]*?)\s*(?:\|([^{}]*))?\}\}/g

/** Uma variável escrita no modelo: o nome, o fallback escrito nela (ou `null`) e onde ela está no texto. */
export type TemplateToken = { name: string; fallback: string | null; start: number; end: number }

/** As variáveis escritas no texto, na ordem; o fallback vem sem os espaços das pontas. */
export function templateTokens(template: string): TemplateToken[] {
	return [...template.matchAll(VARIABLE)].map(match => ({
		name: match[1]!,
		fallback: match[2] === undefined ? null : match[2].trim(),
		start: match.index,
		end: match.index + match[0].length,
	}))
}

/**
 * Um trecho do texto preenchido: o texto do modelo (`text`), o valor da variável (`value`), o fallback, no lugar do
 * valor que a vaga não tem (`fallback`), ou a marca de que faltou o valor (`missing`, escrita como `[nome]`).
 */
export type TemplatePart = { kind: 'text' | 'value' | 'fallback' | 'missing'; text: string; name?: string }

/** O valor de cada variável; `null` (ou texto vazio) é uma vaga sem aquele dado. */
export type TemplateValues = Record<string, string | null | undefined>

/** O que faltou, como a marca que fica no texto (`[empresa]`). */
export function missingMark(name: string) {
	return `[${name}]`
}

/**
 * O modelo em trechos, para a prévia destacar o que veio do fallback e o que faltou. Uma variável fora de `values`
 * (desconhecida: a validação das configurações não deixa salvar) fica no texto como está.
 */
export function templateParts(template: string, values: TemplateValues, fallbacks: Record<string, string> = {}): TemplatePart[] {
	const parts: TemplatePart[] = []
	let last = 0

	const pushText = (text: string) => {
		if (!text) return
		const previous = parts.at(-1)
		if (previous?.kind === 'text') previous.text += text
		else parts.push({ kind: 'text', text })
	}

	for (const token of templateTokens(template)) {
		pushText(template.slice(last, token.start))
		last = token.end

		if (!(token.name in values)) {
			pushText(template.slice(token.start, token.end))
			continue
		}

		const value = values[token.name]?.trim()
		// O fallback escrito na própria variável vale mais que o das configurações
		const fallback = token.fallback || fallbacks[token.name]?.trim()

		if (value) parts.push({ kind: 'value', text: value, name: token.name })
		else if (fallback) parts.push({ kind: 'fallback', text: fallback, name: token.name })
		else parts.push({ kind: 'missing', text: missingMark(token.name), name: token.name })
	}
	pushText(template.slice(last))

	return parts
}

/** O texto preenchido e as variáveis que precisaram do fallback ou ficaram sem valor (sem repetir, na ordem do texto). */
export type FilledTemplate = { text: string; fallbacks: string[]; missing: string[] }

/**
 * Preenche o modelo com os valores. Sem valor, a variável usa o fallback escrito nela (`{{empresa | a sua empresa}}`)
 * ou, sem ele, o das configurações (`fallbacks`); sem nenhum dos dois, fica marcada no texto (`[empresa]`) e entra em
 * `missing`, para quem mostra a mensagem avisar e não deixar enviar.
 */
export function fillTemplate(template: string, values: TemplateValues, fallbacks: Record<string, string> = {}): FilledTemplate {
	const parts = templateParts(template, values, fallbacks)
	const namesOf = (kind: TemplatePart['kind']) => [...new Set(parts.filter(part => part.kind === kind).map(part => part.name!))]

	return { text: parts.map(part => part.text).join(''), fallbacks: namesOf('fallback'), missing: namesOf('missing') }
}

const WORK_MODE_TEXT: Record<NonNullable<ProcessedJob['workMode']>, string> = {
	remoto: 'remoto',
	hibrido: 'híbrido',
	presencial: 'presencial',
}

/** O que o modelo usa da vaga (do banco, do site ou do Discord). */
export type TemplateJob = Partial<
	Pick<ProcessedJob, 'company' | 'location' | 'workMode' | 'necessaryKnowledge' | 'applyLink' | 'postLink' | 'author'>
> & { title: string | null }

/** O que o modelo usa do perfil. */
export type TemplateProfile = { area?: string | null; targetRole?: string | null }

/**
 * Os valores das variáveis para uma vaga: os da vaga, os do perfil e os próprios da pessoa. O link da vaga é o de
 * candidatura e, sem ele, o do post no LinkedIn.
 */
export function templateValues(job: TemplateJob, profile: TemplateProfile, own: readonly OwnVariable[]): TemplateValues {
	return {
		cargo: job.title,
		empresa: job.company,
		local: job.location,
		modalidade: job.workMode ? WORK_MODE_TEXT[job.workMode] : null,
		tecnologias: job.necessaryKnowledge?.length ? job.necessaryKnowledge.join(', ') : null,
		link_da_vaga: job.applyLink || job.postLink,
		autor_do_post: job.author,
		area: profile.area,
		cargo_alvo: profile.targetRole,
		...Object.fromEntries(own.map(variable => [variable.name, variable.value])),
	}
}

/** O modelo, o que fazer quando a vaga não tem um dado e as variáveis próprias (de `MessageSettings`). */
export type TemplateSettings = {
	template: { subject: string; body: string }
	fallbacks: Record<string, string>
	variables: readonly OwnVariable[]
}

/** O e-mail do modelo preenchido para a vaga, com o que usou fallback e o que faltou (no assunto ou na mensagem). */
export type TemplateMessage = { subject: string; body: string; fallbacks: string[]; missing: string[] }

/** Preenche o assunto e a mensagem do modelo para a vaga. */
export function templateMessage(settings: TemplateSettings, job: TemplateJob, profile: TemplateProfile): TemplateMessage {
	const values = templateValues(job, profile, settings.variables)
	const subject = fillTemplate(settings.template.subject, values, settings.fallbacks)
	const body = fillTemplate(settings.template.body, values, settings.fallbacks)

	return {
		subject: subject.text,
		body: body.text,
		fallbacks: [...new Set([...subject.fallbacks, ...body.fallbacks])],
		missing: [...new Set([...subject.missing, ...body.missing])],
	}
}

/** As variáveis que faltaram e ainda estão marcadas no texto (a pessoa ainda não preencheu nem apagou o trecho). */
export function unresolvedMissing(missing: readonly string[], ...texts: string[]) {
	return missing.filter(name => texts.some(text => text.includes(missingMark(name))))
}
