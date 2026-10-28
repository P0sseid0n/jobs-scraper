import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import { MESSAGE_TONES, type ApplicationMessage, type MessageSettings } from '@shared/contracts'
import type { Logger } from '@shared/logging'
import {
	cleanMessageBody,
	MESSAGE_LANGUAGE_NAMES,
	messageLanguage,
	messageStyleRules,
	messageTextProblem,
	styleSampleSection,
	type MessageLanguage,
} from '@shared/templates'

import { knownTechnologies } from './projects/tech-catalog'
import type { TailoredResume } from './resume/resume.types'
import { mentionsSkill, normalizeSkill, skillAliases } from './skills/skill-matching'
import { describeProfile, type TailoringProfile } from './tailoring-prompt'
import type { CvJob } from './target-job'

const POST_MAX = 1500
// Um clichê recusado costuma sumir na versão seguinte: uma tentativa a mais que antes das regras de estilo
const MODEL_ATTEMPTS = 3

type AiOptions = { ollama: Ollama; model: string }

/** O estilo usado quando não há configuração (os padrões de `MessageSettingsSchema`). */
const DEFAULT_STYLE: MessageSettings = { tone: 'neutral', length: 'medium', styleSample: '' }

/**
 * O que a mensagem precisa saber além do currículo e da vaga: o perfil, os requisitos que a pessoa não tem e o estilo
 * das configurações (tom, tamanho e mensagem de exemplo).
 */
export type MessageContext = { profile?: TailoringProfile; unsupportedSkills?: string[]; style?: MessageSettings }

function systemPrompt(style: MessageSettings) {
	return `You write the body of a short job application email that a professional (from any field) sends to a recruiter, with the tailored résumé attached.

Return JSON with ${style.tone === 'auto' ? '"tone" and "body"' : '"body"'}, following these rules:
- Write in the language given in "Message language".
- Plain text (no markdown, no lists, no subject line).
- Say which role you are applying for and, if the company is known, the company name. Never write "unknown".
- Mention 2 or 3 of the job's required skills, tools or qualifications that are in the résumé, and at most one project or experience from the résumé that relates to the job, by its name.
- Say the résumé is attached and that you are available to talk.
- No signature, no candidate name and no placeholders like [name].
- Use only facts from the résumé and the job: never invent companies, years of experience, certifications, numbers, skills or tools.
- Never mention the items in "Not in the résumé": the person does not have them.
- First person.
${messageStyleRules(style.tone, style.length)}`
}

/** O modelo pode devolver o corpo com espaços extras ou repetir o assunto na primeira linha; o tom só vem no `auto`. */
const MessageOutputSchema = z.object({ body: z.string(), tone: z.string().optional() })

/**
 * Escreve com a IA o e-mail de candidatura da vaga, a partir do currículo já ajustado (apresentação, habilidades e
 * projetos escolhidos). Se a resposta for rejeitada pelas validações, pede outra versão uma vez.
 * @returns A mensagem, ou `null` se a IA falhar ou as duas versões forem rejeitadas (os canais usam o modelo padrão).
 */
export async function requestApplicationMessage(
	ai: AiOptions,
	cv: TailoredResume,
	job: CvJob,
	context: MessageContext,
	log: Logger,
): Promise<ApplicationMessage | null> {
	const language = messageLanguage(job.language)
	const style = context.style ?? DEFAULT_STYLE
	const request = buildMessageRequest(cv, job, language, context)
	const messages: Message[] = request.messages

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		let content: string
		try {
			const response = await ai.ollama.chat({ model: ai.model, messages, format: request.format, options: { temperature: 0.3 } })
			content = response.message.content
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA; a mensagem de candidatura fica com o modelo padrão')
			return null
		}

		const output = parseMessageOutput(content)
		const result = validateMessageBody(output?.body ?? null, cv, job, context.unsupportedSkills, style.length)
		if (result.body) {
			return {
				subject: messageSubject(job.title, language),
				body: result.body,
				tone: style.tone === 'auto' ? chosenTone(output?.tone) : style.tone,
				length: style.length,
			}
		}

		log.info({ attempt, reason: result.rejected }, 'Mensagem de candidatura rejeitada')
		messages.push(
			{ role: 'assistant', content },
			{
				role: 'user',
				content: `Your message was rejected: ${result.rejected}. Rewrite it following the rules and return the JSON again.`,
			},
		)
	}

	return null
}

export { messageLanguage }

/** O tom que a IA disse ter escolhido no `auto`; fora da lista, vale o neutro. */
function chosenTone(tone: string | undefined) {
	return MESSAGE_TONES.find(name => name === tone?.trim().toLowerCase()) ?? 'neutral'
}

/** Assunto fixo, sem IA: o cargo é o que o recrutador procura na caixa de entrada. */
export function messageSubject(jobTitle: string | null, language: MessageLanguage) {
	return language === 'en' ? `Application – ${jobTitle ?? 'open position'}` : `Candidatura – ${jobTitle ?? 'a vaga'}`
}

/** Monta o pedido à IA: as regras, o perfil (se houver), o currículo ajustado, a vaga e o que a pessoa não tem. */
export function buildMessageRequest(cv: TailoredResume, job: CvJob, language: MessageLanguage, context: MessageContext = {}) {
	const projects = cv.projects.map(project => `${project.name} (${project.technologies.join(', ')}): ${project.description}`)
	const experience = cv.experience.map(entry => `${entry.header}: ${entry.bullets.slice(0, 2).join(' ')}`)
	const candidate = describeProfile(context.profile ?? {})
	const unsupported = context.unsupportedSkills ?? []
	const style = context.style ?? DEFAULT_STYLE

	const content = [
		`## Message language\n${MESSAGE_LANGUAGE_NAMES[language]}`,
		...(candidate ? [`## Candidate profile\n${candidate}`] : []),
		[
			'## Job opening',
			`Title: ${job.title ?? 'not stated'}`,
			`Company: ${job.company ?? 'not stated'}`,
			`Required skills: ${job.necessaryKnowledge?.join(', ') || 'not listed'}`,
			`Post: ${job.rawContent.normalize('NFKC').slice(0, POST_MAX)}`,
		].join('\n'),
		[
			'## Résumé',
			`Summary: ${cv.summary}`,
			`Skills: ${cv.skills.flatMap(group => group.items).join(' | ')}`,
			...(projects.length > 0 ? [`Projects: ${projects.join(' | ')}`] : []),
			`Experience: ${experience.join(' | ')}`,
		].join('\n'),
		...(unsupported.length > 0 ? [`## Not in the résumé\n${unsupported.join(', ')}`] : []),
		...styleSampleSection(style.styleSample),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: systemPrompt(style) },
		{ role: 'user', content },
	]

	const format =
		style.tone === 'auto'
			? z.toJSONSchema(z.object({ tone: z.enum(MESSAGE_TONES), body: z.string() }))
			: z.toJSONSchema(z.object({ body: z.string() }))

	return { messages, format }
}

/** Lê a resposta do modelo (`null` se não for o JSON esperado). */
export function parseMessageOutput(content: string): { body: string; tone?: string } | null {
	try {
		return MessageOutputSchema.parse(JSON.parse(content))
	} catch {
		return null
	}
}

/** Lê o corpo da resposta do modelo (`null` se não for o JSON esperado). */
export function parseMessageBody(content: string): string | null {
	return parseMessageOutput(content)?.body ?? null
}

/**
 * Valida o corpo da mensagem: tamanho, texto puro, sem placeholders, sem anos de experiência, sem clichês, sem
 * tecnologias que não estão no currículo nem na vaga e sem os requisitos da vaga que a pessoa não tem (`unsupportedSkills`).
 * @returns O corpo limpo, ou o motivo da rejeição.
 */
export function validateMessageBody(
	candidate: string | null,
	cv: TailoredResume,
	job: Pick<CvJob, 'necessaryKnowledge'>,
	unsupportedSkills: string[] = [],
	length: MessageSettings['length'] = 'medium',
): { body: string; rejected: null } | { body: null; rejected: string } {
	const body = cleanMessageBody(candidate ?? '')

	const problem = messageTextProblem(body, length)
	if (problem) return { body: null, rejected: problem }

	const unknown = technologiesOutside(body, cv, job)
	if (unknown.length > 0) {
		return { body: null, rejected: `it mentions technologies that are not in the résumé or the job: ${unknown.join(', ')}` }
	}

	const invented = unsupportedSkills.filter(skill => mentionsSkill(body, skill))
	if (invented.length > 0) {
		return { body: null, rejected: `it mentions skills the person does not have: ${invented.join(', ')}` }
	}

	return { body, rejected: null }
}

/**
 * Tecnologias do catálogo citadas no texto que não estão nas habilidades, nos projetos do currículo nem na vaga. Vale
 * para qualquer área: um currículo sem tecnologias só não pode ganhar uma na mensagem.
 */
function technologiesOutside(body: string, cv: TailoredResume, job: Pick<CvJob, 'necessaryKnowledge'>) {
	const allowed = new Set([
		...cv.skills.flatMap(group => group.items).flatMap(item => [...skillAliases(item)]),
		...cv.projects.flatMap(project => project.technologies.map(normalizeSkill)),
		...(job.necessaryKnowledge ?? []).flatMap(skill => [...skillAliases(skill)]),
	])

	return knownTechnologies().filter(name => mentions(body, name) && !allowed.has(normalizeSkill(name)))
}

/**
 * Procura o nome como palavra, diferenciando maiúsculas: em inglês, "Express" é tecnologia e "express" é verbo.
 * "Vue.js" também vale como "Vue".
 */
function mentions(text: string, name: string) {
	const base = name.replace(/\.js$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

	return new RegExp(`(?<![\\w.])${base}(\\.js)?(?![\\w#+])`).test(text)
}
