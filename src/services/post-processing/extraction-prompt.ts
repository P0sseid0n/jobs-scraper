import type { Message } from 'ollama'
import { z } from 'zod'

import { WORK_MODES } from '@shared/contracts'

import { POST_TYPES } from './extraction-output'

/**
 * Schema enviado ao Ollama em `format` (structured outputs): o modelo é obrigado a gerar um JSON nesse formato.
 * A ordem das propriedades é a ordem de geração: o modelo primeiro classifica o post (`postType`, uma escolha
 * fechada, mais fácil para modelos pequenos que um booleano) e só depois extrai os campos.
 */
const ModelOutputSchema = z.object({
	postType: z.enum(POST_TYPES),
	aiJobConfidence: z.number().int().min(0).max(100),
	title: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	workMode: z.enum(WORK_MODES).nullable(),
	necessary_knowledge: z.array(z.string()),
	recruiter_email: z.string().nullable(),
	link: z.string().nullable(),
})

export const EXTRACTION_OUTPUT_FORMAT = z.toJSONSchema(ModelOutputSchema)

// Prompt em inglês: modelos pequenos (ex.: gemma3:4b) seguem instruções em inglês com mais precisão,
// mesmo quando o post está em português. Os valores extraídos continuam no idioma do post.
// Sem exemplos few-shot em JSON: nos testes o modelo de 4B copiava empresa/cargo dos exemplos.
const SYSTEM_PROMPT = `You classify LinkedIn posts and extract job openings from them. Posts may be in any language (usually Portuguese or English).

## 1. postType: classify the post first
- "job_opening": a company, recruiter or hiring manager is hiring for an open position.
- "job_seeker": the author is looking for a job, is unemployed, or is available for work ("open to work").
- "course_or_graduation": the author finished or is promoting a course, bootcamp, degree or certificate, even if it lists technologies.
- "tips_or_list": career advice, interview tips, or lists of job boards, websites or companies.
- "other": anything else (news, events, opinions, motivational content, achievements).
Mentioning technologies or the word "developer" does NOT make a post a job_opening. There must be a vacancy someone is hiring for.

## 2. aiJobConfidence (0-100): how sure you are that the post is a job_opening
- 90-100: explicit vacancy with a role and a way to apply or a company.
- 60-89: clearly hiring, but details are vague.
- 30-59: unclear.
- 0-29: not a vacancy (always use this range when postType is not "job_opening").

## 3. Extract the fields, using only the post text
If the post lists several openings, extract only ONE: the opening most related to software development (or the first one if none is).
Every field must come from that same opening; never mix the title of one opening with the link or skills of another.

- title: the role exactly as written, without emojis. null if absent.
- company: the hiring company. null if not named. Never write placeholders like "unknown".
- location: city, state and/or country of the job. null if absent. Never put the work mode here ("remote", "home office" and "hybrid" go in workMode).
- workMode: "remoto" (remote), "presencial" (on-site) or "hibrido" (hybrid). null if not stated.
- necessary_knowledge: technologies and skills written in the post for this opening, as short names (e.g. "Vue.js", "TypeScript"); at most 10; [] if none. Never add technologies that are not written, even if they are typical for the role.
- recruiter_email: a contact email written in the post. null if absent.
- link: an application URL (starting with http) written in the post. null if absent.

Never guess or invent values; use null when the information is not in the post. Copy emails and URLs exactly.`

export function buildExtractionMessages(post: { text: string; author: string | null }): Message[] {
	return [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: `Post author: ${post.author ?? 'unknown'}\nPost:\n${post.text}` },
	]
}
