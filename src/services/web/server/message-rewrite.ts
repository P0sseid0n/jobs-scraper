import type { Message, Ollama } from 'ollama'
import { z } from 'zod'

import { MESSAGE_LENGTHS, MESSAGE_TONES, type ApplicationMessage, type MessageLength } from '@shared/contracts'
import { Job } from '@shared/database'
import type { Logger } from '@shared/logging'
import { readSettings } from '@shared/settings'
import {
	cleanMessageBody,
	clichesIn,
	MESSAGE_LANGUAGE_NAMES,
	messageLanguage,
	messageStyleRules,
	messageTextProblem,
	newProperNouns,
	styleSampleSection,
	type MessageLanguage,
} from '@shared/templates'

import type { WebCvRequest } from '../api-types'
import { CvRequestRecord, toWebCvRequest } from './cv-request.model'
import type { EventHub } from './event-hub'
import { HttpError, readJson } from './http'

// Modelos pequenos tendem a copiar frases da mensagem atual, clichês inclusive: uma tentativa a mais
const MODEL_ATTEMPTS = 3
const POST_MAX = 1500

/** O que a pessoa pediu no detalhe da vaga: o tom e o tamanho desejados e, se for o caso, uma versão mais direta. */
export const RewriteRequestSchema = z.object({
	tone: z.enum(MESSAGE_TONES),
	length: z.enum(MESSAGE_LENGTHS),
	direct: z.boolean().default(false),
})

export type RewriteRequest = z.output<typeof RewriteRequestSchema>

/** A vaga, para a IA (e a validação) saber o que pode ser citado além do que já estava na mensagem. */
export type RewriteJob = { title: string | null; company: string | null; necessaryKnowledge: string[]; rawContent: string }

type Deps = { ai: { ollama: Ollama; model: string }; events: EventHub; logger: Logger }

const SYSTEM_PROMPT = `You rewrite the body of a job application email that a professional sends to a recruiter, with the résumé attached.

Return JSON with "body", following these rules:
- Write in the language given in "Message language".
- Keep the facts of the current message: the role, the company, the skills and the project or experience it cites. You may drop some of them to make it shorter, but never add a skill, tool, project, company, number or claim that is not in the current message or in the job.
- Keep saying the résumé is attached and that you are available to talk.
- Plain text (no markdown, no lists, no subject line), no signature, no candidate name and no placeholders like [name].
- Write new sentences instead of copying the current ones.
- First person.`

const DIRECT_RULE =
	'- Make it more direct: cut filler and pleasantries, lead with the role and the most relevant fact, and use fewer, shorter sentences.'

/** Monta o pedido de reescrita: a mensagem atual, a vaga, o estilo pedido e a mensagem de exemplo da pessoa. */
export function buildRewriteRequest(
	message: Pick<ApplicationMessage, 'body'>,
	job: RewriteJob,
	language: MessageLanguage,
	request: RewriteRequest,
	styleSample = '',
) {
	const cliches = clichesIn(message.body)
	const rules = [SYSTEM_PROMPT, messageStyleRules(request.tone, request.length), ...(request.direct ? [DIRECT_RULE] : [])]

	const content = [
		`## Message language\n${MESSAGE_LANGUAGE_NAMES[language]}`,
		[
			'## Job opening',
			`Title: ${job.title ?? 'not stated'}`,
			`Company: ${job.company ?? 'not stated'}`,
			`Required skills: ${job.necessaryKnowledge.join(', ') || 'not listed'}`,
		].join('\n'),
		`## Current message\n${message.body}`,
		...(cliches.length > 0
			? [
					`## Clichés in the current message\nRewrite the sentences with ${cliches.map(label => `"${label}"`).join(', ')} without them.`,
				]
			: []),
		...styleSampleSection(styleSample),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: rules.join('\n') },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(z.object({ body: z.string() })) }
}

/**
 * Valida a versão reescrita: as regras de qualquer mensagem (tamanho, clichês…) e nenhum nome próprio que não estava
 * na mensagem anterior nem na vaga (a reescrita não pode inventar tecnologias, empresas ou projetos).
 * @returns O corpo limpo, ou o motivo da recusa (em inglês, para devolver ao modelo).
 */
export function validateRewrite(
	candidate: string | null,
	previous: Pick<ApplicationMessage, 'body'>,
	job: RewriteJob,
	length: MessageLength,
): { body: string; rejected: null } | { body: null; rejected: string } {
	const body = cleanMessageBody(candidate ?? '')

	const problem = messageTextProblem(body, length)
	if (problem) return { body: null, rejected: problem }

	const sources = [
		previous.body,
		job.title ?? '',
		job.company ?? '',
		job.necessaryKnowledge.join(', '),
		job.rawContent.slice(0, POST_MAX),
	]
	const invented = newProperNouns(body, sources)
	if (invented.length > 0) {
		return { body: null, rejected: `it adds names that are not in the current message or the job: ${invented.join(', ')}` }
	}

	return { body, rejected: null }
}

/** Pede a reescrita à IA; se a resposta for recusada, pede outra uma vez. `null` se a IA falhar ou as duas forem recusadas. */
export async function requestRewrite(
	ai: Deps['ai'],
	message: ApplicationMessage,
	job: RewriteJob & { language: string | null },
	request: RewriteRequest,
	styleSample: string,
	log: Logger,
): Promise<ApplicationMessage | null> {
	const { messages, format } = buildRewriteRequest(message, job, messageLanguage(job.language), request, styleSample)

	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
		let content: string
		try {
			const response = await ai.ollama.chat({ model: ai.model, messages, format, options: { temperature: 0.4 } })
			content = response.message.content
		} catch (error) {
			log.warn({ err: error }, 'Falha ao consultar a IA para reescrever a mensagem')
			return null
		}

		const result = validateRewrite(parseBody(content), message, job, request.length)
		if (result.body) return { subject: message.subject, body: result.body, tone: request.tone, length: request.length }

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

/**
 * `POST /api/cv/:requestId/message`: reescreve a mensagem do pedido com o tom e o tamanho pedidos (ou mais direta). A
 * versão de antes fica guardada para desfazer. Se a IA não conseguir, responde 502 e a mensagem continua a mesma.
 */
export async function rewriteCvMessage(req: Request & { params: { requestId: string } }, { ai, events, logger }: Deps) {
	const request = RewriteRequestSchema.parse(await readJson(req))
	const doc = await findWithMessage(req.params.requestId)
	const message = toWebCvRequest(doc).message!

	const job = await Job.findOne(
		{ postId: doc.postId },
		{ title: 1, company: 1, necessaryKnowledge: 1, rawContent: 1, language: 1 },
	).lean()
	if (!job) throw new HttpError(404, 'Vaga não encontrada')

	const log = logger.child({ postId: doc.postId, requestId: doc.requestId })
	const { styleSample } = await readSettings('message')
	const rewritten = await requestRewrite(
		ai,
		message,
		{
			title: job.title ?? null,
			company: job.company ?? null,
			necessaryKnowledge: job.necessaryKnowledge ?? [],
			rawContent: job.rawContent,
			language: job.language ?? null,
		},
		request,
		styleSample,
		log,
	)
	if (!rewritten) throw new HttpError(502, 'A IA não conseguiu reescrever a mensagem agora; ela continua como estava.')

	const saved = await CvRequestRecord.findOneAndUpdate(
		{ requestId: doc.requestId },
		{ message: rewritten, previousMessage: message },
		{ returnDocument: 'after', projection: { pdf: 0 }, lean: true },
	)
	if (!saved) throw new HttpError(404, 'Pedido de currículo não encontrado')

	const result = toWebCvRequest(saved)
	events.broadcast('cv', result)
	log.info({ tone: request.tone, length: request.length, direct: request.direct }, 'Mensagem de candidatura reescrita')

	return Response.json(result satisfies WebCvRequest)
}

/** `POST /api/cv/:requestId/message/undo`: volta à versão de antes da última reescrita (de novo, refaz). */
export async function undoCvMessage(req: Request & { params: { requestId: string } }, { events }: Pick<Deps, 'events'>) {
	const doc = await findWithMessage(req.params.requestId)
	if (!doc.previousMessage) throw new HttpError(409, 'Não há versão anterior da mensagem')

	const saved = await CvRequestRecord.findOneAndUpdate(
		{ requestId: doc.requestId },
		{ message: doc.previousMessage, previousMessage: doc.message },
		{ returnDocument: 'after', projection: { pdf: 0 }, lean: true },
	)
	if (!saved) throw new HttpError(404, 'Pedido de currículo não encontrado')

	const result = toWebCvRequest(saved)
	events.broadcast('cv', result)

	return Response.json(result satisfies WebCvRequest)
}

async function findWithMessage(requestId: string) {
	const doc = await CvRequestRecord.findOne({ requestId, status: 'ready' }, { pdf: 0 }).lean()
	if (!doc) throw new HttpError(404, 'Currículo não encontrado ou ainda não gerado')
	if (!doc.message) throw new HttpError(409, 'Este currículo não tem mensagem gerada pela IA')

	return doc
}
