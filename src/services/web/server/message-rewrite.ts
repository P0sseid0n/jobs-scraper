import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type MessageLength } from '@shared/contracts'
import { Job } from '@shared/database'
import type { Logger } from '@shared/logging'
import {
	claimsYears,
	cleanMessageBody,
	clichesIn,
	MESSAGE_LANGUAGE_NAMES,
	messageLanguage,
	messageStyleRules,
	messageTextProblem,
	newProperNouns,
	type MessageLanguage,
} from '@shared/templates'

import type { WebImprovedMessage } from '../api-types'
import { HttpError, readJson } from './http'

// Modelos pequenos tendem a copiar frases da mensagem atual, clichês inclusive: uma tentativa a mais
const MODEL_ATTEMPTS = 3
const POST_MAX = 1500

/** O que a pessoa pediu na modal do contato: o tom e o tamanho desejados e, se for o caso, uma versão mais direta. */
export const RewriteRequestSchema = z.object({
	tone: z.enum(MESSAGE_TONES),
	length: z.enum(MESSAGE_LENGTHS),
	direct: z.boolean().default(false),
})

export type RewriteRequest = z.output<typeof RewriteRequestSchema>

/** A vaga, para a IA (e a validação) saber o que pode ser citado além do que já estava na mensagem. */
export type RewriteJob = { title: string | null; company: string | null; necessaryKnowledge: string[]; rawContent: string }

type Deps = { ai: { ollama: Ollama; model: string }; logger: Logger }

const SYSTEM_PROMPT = `You rewrite the body of a job application email that a professional sends to a recruiter, with the résumé attached.

Return JSON with "body", following these rules:
- Write in the language given in "Message language".
- Keep the facts of the current message: the role, the company, the skills and the project or experience it cites. You may drop some of them to make it shorter, but never add a skill, tool, project, company, number or claim that is not in the current message or in the job.
- Keep every link (URL) of the current message, exactly as written.
- Keep saying the résumé is attached and that you are available to talk.
- Plain text (no markdown, no lists, no subject line), no signature block and no placeholders like [name]. The candidate's name only if the current message has it.
- Write new sentences instead of copying the current ones.
- First person.`

const DIRECT_RULE =
	'- Make it more direct: cut filler and pleasantries, lead with the role and the most relevant fact, and use fewer, shorter sentences.'

/** Monta o pedido de reescrita: a mensagem atual, a vaga e o estilo pedido. */
export function buildRewriteRequest(body: string, job: RewriteJob, language: MessageLanguage, request: RewriteRequest) {
	const cliches = clichesIn(body)
	const rules = [SYSTEM_PROMPT, messageStyleRules(request.tone, request.length), ...(request.direct ? [DIRECT_RULE] : [])]

	const content = [
		`## Message language\n${MESSAGE_LANGUAGE_NAMES[language]}`,
		[
			'## Job opening',
			`Title: ${job.title ?? 'not stated'}`,
			`Company: ${job.company ?? 'not stated'}`,
			`Required skills: ${job.necessaryKnowledge.join(', ') || 'not listed'}`,
		].join('\n'),
		`## Current message\n${body}`,
		...(cliches.length > 0
			? [
					`## Clichés in the current message\nRewrite the sentences with ${cliches.map(label => `"${label}"`).join(', ')} without them.`,
				]
			: []),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: rules.join('\n') },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(z.object({ body: z.string() })) }
}

/** Os links do texto, sem a pontuação que fecha a frase ("…/carla."). */
function linksIn(text: string) {
	return (text.match(/https?:\/\/\S+/g) ?? []).map(link => link.replace(/[.,;:!?)]+$/, ''))
}

/**
 * Valida a versão reescrita: as regras de qualquer mensagem (tamanho, clichês…), os links da mensagem de antes (as
 * variáveis de link do modelo: a IA costuma tirá-los ou quebrá-los) e nenhum nome próprio que não estava na mensagem de
 * antes nem na vaga (a reescrita não pode inventar tecnologias, empresas ou projetos). Os anos de experiência só passam
 * se a pessoa já os tinha escrito.
 * @returns O corpo limpo, ou o motivo da recusa (em inglês, para devolver ao modelo).
 */
export function validateRewrite(
	candidate: string | null,
	previous: string,
	job: RewriteJob,
	length: MessageLength,
): { body: string; rejected: null } | { body: null; rejected: string } {
	const body = cleanMessageBody(candidate ?? '')

	const problem = messageTextProblem(body, length, { yearsAllowed: claimsYears(previous) })
	if (problem) return { body: null, rejected: problem }

	const dropped = linksIn(previous).filter(link => !body.includes(link))
	if (dropped.length > 0) {
		return { body: null, rejected: `it drops or changes links of the current message: ${dropped.join(', ')}` }
	}

	const sources = [previous, job.title ?? '', job.company ?? '', job.necessaryKnowledge.join(', '), job.rawContent.slice(0, POST_MAX)]
	const invented = newProperNouns(body, sources)
	if (invented.length > 0) {
		return { body: null, rejected: `it adds names that are not in the current message or the job: ${invented.join(', ')}` }
	}

	return { body, rejected: null }
}

/**
 * Pede a reescrita à IA; se a resposta for recusada, pede outra (até `MODEL_ATTEMPTS`). `null` se a IA falhar ou todas
 * forem recusadas.
 */
export async function requestRewrite(
	ai: Deps['ai'],
	body: string,
	job: RewriteJob & { language: string | null },
	request: RewriteRequest,
	log: Logger,
): Promise<string | null> {
	const { messages, format } = buildRewriteRequest(body, job, messageLanguage(job.language), request)

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		let content: string
		try {
			const response = await ai.ollama.chat({ model: ai.model, messages, format, options: { temperature: 0.4 } })
			content = response.message.content
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA para reescrever a mensagem')
			return null
		}

		const result = validateRewrite(parseBody(content), body, job, request.length)
		if (result.body) return result.body

		log.info({ attempt, reason: result.rejected }, 'Mensagem reescrita recusada')
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

function parseBody(content: string) {
	try {
		return z.object({ body: z.string() }).parse(JSON.parse(content)).body
	} catch {
		return null
	}
}

/** "Melhorar com a IA": o texto da modal (o modelo preenchido ou o que a pessoa editou, sem a assinatura) e o estilo. */
export const ImproveRequestSchema = RewriteRequestSchema.extend({
	body: z.string().trim().min(1, 'Escreva a mensagem antes de pedir à IA').max(5000),
})

/**
 * `POST /api/jobs/:postId/message`: reescreve com a IA o texto que a pessoa tem na modal, sem guardar nada: quem pediu
 * decide se fica com a versão nova. Se a IA não conseguir, responde 502.
 */
export async function improveJobMessage(req: Request & { params: { postId: string } }, { ai, logger }: Deps) {
	const { body, ...request } = ImproveRequestSchema.parse(await readJson(req))
	const job = await Job.findOne(
		{ postId: req.params.postId },
		{ title: 1, company: 1, necessaryKnowledge: 1, rawContent: 1, language: 1 },
	).lean()
	if (!job) throw new HttpError(404, 'Vaga não encontrada')

	const log = logger.child({ postId: req.params.postId })
	const rewritten = await requestRewrite(
		ai,
		body,
		{
			title: job.title ?? null,
			company: job.company ?? null,
			necessaryKnowledge: job.necessaryKnowledge ?? [],
			rawContent: job.rawContent,
			language: job.language ?? null,
		},
		request,
		log,
	)
	if (!rewritten) throw new HttpError(502, 'A IA não conseguiu melhorar a mensagem agora; ela continua como estava.')

	log.info({ tone: request.tone, length: request.length, direct: request.direct }, 'Mensagem melhorada pela IA')

	return Response.json({ body: rewritten } satisfies WebImprovedMessage)
}
