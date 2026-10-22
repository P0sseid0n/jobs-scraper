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
const SYSTEM_PROMPT_TEMPLATE = `You classify LinkedIn posts and extract job openings from them. Posts may be in any language (usually Portuguese or English).

## 1. postType: classify the post first
- "job_opening": a company, recruiter or hiring manager is hiring for an open position.
- "job_seeker": the author is looking for a job, is unemployed, is available for work ("open to work", "#OpenToWork", "aberto a novas oportunidades"), describes their own experience, skills, results or portfolio, or invites recruiters to contact them. The roles listed in such a post are the roles the author WANTS, not vacancies.
- "course_or_graduation": the author finished or is promoting a course, bootcamp, degree or certificate, even if it lists skills or tools.
- "tips_or_list": career advice, interview tips, or lists of job boards, websites or companies.
- "other": anything else (news, events, webinars, opinions, motivational content, stories about the author's own interviews, achievements, the author announcing their own new job or promotion, the author or their team presenting a project, product, campaign, case or study they built or ran).
Mentioning skills, tools or a role name ("developer", "nurse", "lawyer") does NOT make a post a job_opening. There must be a vacancy someone is hiring for.
The tools or methods of a project ("built with React and Java", "we used Excel and Power BI", "o que aprendemos") are not a list of requirements, and the name of a project or product is not a hiring company. Tags or keyword lists at the end of the post ("hiring", "recruitment", role names) do not make it a job_opening either.
Ask who the post is about. A job_opening is written from the hiring side: it invites candidates to apply ("we are hiring", "estamos contratando", "vaga", "buscamos", "requisitos"). If the author writes in the first person singular about their own career ("I worked", "my experience", "trabalhei", "minha trajetória", "estou buscando", "estou aberto", "comecei como"), it is NOT a job_opening, even when it names a role, a seniority, a company or technologies.

## 2. Extract the fields, using only the post text
If the post lists several openings, extract only ONE: {severalOpenings}.
Every field must come from that same opening; never mix the title of one opening with the link or skills of another.

- title: the role exactly as written, keeping the seniority written with it (e.g. "Pleno", "Sênior", "Júnior/Pleno"), without emojis. null if absent.
- company: the name of the hiring company, as written in the post. null if not named: a description ("healthtech consolidada", "empresa de tecnologia") is not a name, and never take it from a URL or an email address. When a recruiting agency posts for a client, the company is the client (null if the client is not named).
- location: city, state and/or country of the job. null if absent. Never put the work mode here ("remote", "home office" and "hybrid" go in workMode).
- workMode: "remoto" (remote), "presencial" (on-site) or "hibrido" (hybrid). null if not stated; never infer it from the role.
- contractTypes: the hiring regimes written in the post: "clt" (CLT employment), "pj" (contractor, "pessoa jurídica"), "estagio" (internship) or "freelance". List every regime written (e.g. "CLT ou PJ" → ["clt", "pj"]); [] if not stated. Never infer the regime from the role or the salary.
- necessary_knowledge: the skills, tools and qualifications written for the chosen opening only (never those listed for the other openings), as short names: technologies, software, languages, certifications, licenses and professional registrations (e.g. "TypeScript", "Excel", "Inglês", "CNH B", "COREN", "OAB"); at most 10; [] if none. Leave out soft skills (communication, teamwork, proactivity). Never add items that are not written, even if they are typical for the role.
- recruiter_email: a contact email written in the post. null if absent.
- link: an application URL (starting with http) written in the post. null if absent.

Never guess or invent values; use null when the information is not in the post, never placeholders like "unknown" or "não especificado". Copy emails and URLs exactly.`

/** Qual vaga extrair de um post com várias: a mais próxima do cargo-alvo do perfil ou, sem perfil, a primeira. */
const SEVERAL_OPENINGS = {
	withTargetRole:
		'the opening closest to the role {targetRole}, even if it is not the first one listed (the first one only if no opening is related to that role)',
	withoutTargetRole: 'the first one',
}

/**
 * Versão do prompt: hash do texto e do formato pedidos ao modelo. Muda sozinha a cada edição do prompt, e é salva
 * em cada vaga para comparar os erros corrigidos pelo site entre versões. O cargo-alvo fica fora: é um dado, como o
 * post, e trocá-lo no perfil não cria uma versão nova.
 */
export const EXTRACTION_PROMPT_VERSION = new Bun.CryptoHasher('sha256')
	.update(SYSTEM_PROMPT_TEMPLATE)
	.update(JSON.stringify(SEVERAL_OPENINGS))
	.update(JSON.stringify(EXTRACTION_OUTPUT_FORMAT))
	.digest('hex')
	.slice(0, 12)

/** Mensagens da extração; `targetRole` é o cargo-alvo do perfil (`null` sem perfil). */
export function buildExtractionMessages(post: { text: string; author: string | null }, targetRole: string | null): Message[] {
	const severalOpenings = targetRole
		? SEVERAL_OPENINGS.withTargetRole.replace('{targetRole}', () => JSON.stringify(targetRole))
		: SEVERAL_OPENINGS.withoutTargetRole

	return [
		// Com função: um "$&" no cargo-alvo não vira o trecho substituído
		{ role: 'system', content: SYSTEM_PROMPT_TEMPLATE.replace('{severalOpenings}', () => severalOpenings) },
		{ role: 'user', content: `Post author: ${post.author ?? 'unknown'}\nPost:\n${post.text}` },
	]
}
