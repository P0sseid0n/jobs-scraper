import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import type { ApplicationMessage } from '@shared/contracts'
import type { Logger } from '@shared/logging'

import { knownTechnologies } from './projects/tech-catalog'
import type { TailoredResume } from './resume/resume.types'
import { normalizeSkill, skillAliases } from './skills/skill-matching'
import type { CvJob } from './target-job'

const BODY_MIN = 150
const BODY_MAX = 700
const POST_MAX = 1500
const MODEL_ATTEMPTS = 2

type MessageLanguage = 'pt' | 'en'
type AiOptions = { ollama: Ollama; model: string }

const LANGUAGE_NAMES: Record<MessageLanguage, string> = { pt: 'Brazilian Portuguese', en: 'English' }

const SYSTEM_PROMPT = `You write the body of a short job application email that a developer sends to a recruiter, with the tailored résumé attached.

Return JSON with "body", following these rules:
- Write in the language given in "Message language".
- At most ${BODY_MAX - 100} characters, in 2 or 3 short paragraphs of plain text (no markdown, no lists, no subject line).
- Start with a short greeting ("Olá! Tudo bem?" in Portuguese, "Hello," in English).
- Say which role you are applying for and, if the company is known, the company name. Never write "unknown".
- Mention 2 or 3 of the job's required technologies that are in the résumé skills, and at most one project or experience from the résumé that relates to the job, by its name.
- Say the résumé is attached and that you are available to talk.
- End with a short thanks. No signature, no candidate name and no placeholders like [name].
- Use only facts from the résumé and the job: never invent companies, years of experience, certifications, numbers or technologies.
- First person, polite and direct; avoid clichés like "I am passionate about".`

/** O modelo pode devolver o corpo com espaços extras ou repetir o assunto na primeira linha. */
const MessageOutputSchema = z.object({ body: z.string() })

const PLACEHOLDER = /\[[^\]]*\]|<[^>]*>|\{[^}]*\}|\bx{3,}\b|seu nome|your name|nome da empresa|company name/i
const MARKDOWN = /\*\*|^\s*#+\s|^\s*[-*]\s|```/m
const YEARS_CLAIM = /\d+\s*\+?\s*(anos|years)\b/i
const SUBJECT_LINE = /^\s*(assunto|subject)\s*:[^\n]*\n+/i

/**
 * Escreve com a IA o e-mail de candidatura da vaga, a partir do currículo já ajustado (apresentação, habilidades e
 * projetos escolhidos). Se a resposta for rejeitada pelas validações, pede outra versão uma vez.
 * @returns A mensagem, ou `null` se a IA falhar ou as duas versões forem rejeitadas (os canais usam o modelo padrão).
 */
export async function requestApplicationMessage(
	ai: AiOptions,
	cv: TailoredResume,
	job: CvJob,
	log: Logger,
): Promise<ApplicationMessage | null> {
	const language = messageLanguage(job.language)
	const request = buildMessageRequest(cv, job, language)
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

		const result = validateMessageBody(parseMessageBody(content), cv, job)
		if (result.body) return { subject: messageSubject(job.title, language), body: result.body }

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

/** Idioma da mensagem: o do post quando é inglês; português nos outros casos (inclusive idioma desconhecido). */
export function messageLanguage(postLanguage: string | null): MessageLanguage {
	return postLanguage === 'en' ? 'en' : 'pt'
}

/** Assunto fixo, sem IA: o cargo é o que o recrutador procura na caixa de entrada. */
export function messageSubject(jobTitle: string | null, language: MessageLanguage) {
	return language === 'en' ? `Application – ${jobTitle ?? 'open position'}` : `Candidatura – ${jobTitle ?? 'a vaga'}`
}

/** Monta o pedido à IA: as regras, o currículo ajustado e a vaga. */
export function buildMessageRequest(cv: TailoredResume, job: CvJob, language: MessageLanguage) {
	const projects = cv.projects.map(project => `${project.name} (${project.technologies.join(', ')}): ${project.description}`)
	const experience = cv.experience.map(entry => `${entry.header}: ${entry.bullets.slice(0, 2).join(' ')}`)

	const content = [
		`## Message language\n${LANGUAGE_NAMES[language]}`,
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
			`Projects: ${projects.join(' | ')}`,
			`Experience: ${experience.join(' | ')}`,
		].join('\n'),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(MessageOutputSchema) }
}

/** Lê o corpo da resposta do modelo (`null` se não for o JSON esperado). */
export function parseMessageBody(content: string): string | null {
	try {
		return MessageOutputSchema.parse(JSON.parse(content)).body
	} catch {
		return null
	}
}

/**
 * Valida o corpo da mensagem: tamanho, texto puro, sem placeholders, sem anos de experiência e sem tecnologias
 * que não estão no currículo nem na vaga.
 * @returns O corpo limpo, ou o motivo da rejeição.
 */
export function validateMessageBody(
	candidate: string | null,
	cv: TailoredResume,
	job: Pick<CvJob, 'necessaryKnowledge'>,
): { body: string; rejected: null } | { body: null; rejected: string } {
	const body = cleanBody(candidate ?? '')

	if (!body) return { body: null, rejected: 'empty or invalid JSON' }
	if (body.length < BODY_MIN || body.length > BODY_MAX) {
		return { body: null, rejected: `length ${body.length} is outside ${BODY_MIN}-${BODY_MAX} characters` }
	}
	if (PLACEHOLDER.test(body)) return { body: null, rejected: 'it has a placeholder to fill in' }
	if (MARKDOWN.test(body)) return { body: null, rejected: 'it uses markdown; write plain text' }
	if (YEARS_CLAIM.test(body)) return { body: null, rejected: 'it claims years of experience' }

	const unknown = technologiesOutside(body, cv, job)
	if (unknown.length > 0) {
		return { body: null, rejected: `it mentions technologies that are not in the résumé or the job: ${unknown.join(', ')}` }
	}

	return { body, rejected: null }
}

/** Tira o assunto repetido e os espaços extras, mantendo os parágrafos. */
function cleanBody(text: string) {
	return text
		.replace(SUBJECT_LINE, '')
		.split('\n')
		.map(line => line.trim().replace(/\s+/g, ' '))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}

/** Tecnologias conhecidas citadas no texto que não estão nas habilidades, nos projetos do currículo nem na vaga. */
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
