import type { Message } from 'ollama'
import { z } from 'zod'

import { CONTRACT_TYPES, WORK_MODES } from '@shared/contracts'

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
	contractTypes: z.array(z.enum(CONTRACT_TYPES)),
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
- "job_seeker": the author is looking for a job, is unemployed, is available for work ("open to work", "#OpenToWork", "aberto a novas oportunidades"), describes their own experience, skills, results or portfolio, or invites recruiters to contact them. The roles listed in such a post are the roles the author WANTS, not vacancies.
- "course_or_graduation": the author finished or is promoting a course, bootcamp, degree or certificate, even if it lists technologies.
- "tips_or_list": career advice, interview tips, or lists of job boards, websites or companies.
- "other": anything else (news, events, opinions, motivational content, stories about the author's own interviews, achievements, the author announcing their own new job or promotion, the author or their team presenting a project, app, product, library or release they built).
Mentioning technologies or the word "developer" does NOT make a post a job_opening. There must be a vacancy someone is hiring for.
A project's tech stack ("built with React and Java", "o que aprendemos") is not a list of requirements, and the name of a project or product is not a hiring company. Tags or keyword lists at the end of the post ("hiring", "recruitment", role names) do not make it a job_opening either.
Ask who the post is about. A job_opening is written from the hiring side: it invites candidates to apply ("we are hiring", "estamos contratando", "vaga", "buscamos", "requisitos"). If the author writes in the first person singular about their own career ("I worked", "my experience", "trabalhei", "minha trajetória", "estou buscando", "estou aberto", "comecei como"), it is NOT a job_opening, even when it names a role, a seniority, a company or technologies.

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
- contractTypes: the hiring regimes written in the post: "clt" (CLT employment), "pj" (contractor, "pessoa jurídica"), "estagio" (internship) or "freelance". List every regime written (e.g. "CLT ou PJ" → ["clt", "pj"]); [] if not stated. Never infer the regime from the role or the salary.
- necessary_knowledge: technologies and skills written in the post for this opening, as short names (e.g. "Vue.js", "TypeScript"); at most 10; [] if none. Never add technologies that are not written, even if they are typical for the role.
- recruiter_email: a contact email written in the post. null if absent.
- link: an application URL (starting with http) written in the post. null if absent.

Never guess or invent values; use null when the information is not in the post. Copy emails and URLs exactly.`

/**
 * Versão do prompt: hash do texto e do formato pedidos ao modelo. Muda sozinha a cada edição do prompt, e é salva
 * em cada vaga para comparar os erros corrigidos pelo site entre versões.
 */
export const EXTRACTION_PROMPT_VERSION = new Bun.CryptoHasher('sha256')
	.update(SYSTEM_PROMPT)
	.update(JSON.stringify(EXTRACTION_OUTPUT_FORMAT))
	.digest('hex')
	.slice(0, 12)

export function buildExtractionMessages(post: { text: string; author: string | null }): Message[] {
	return [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: `Post author: ${post.author ?? 'unknown'}\nPost:\n${post.text}` },
	]
}
