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

/**
 * O formato para um post com imagens: o modelo primeiro transcreve o texto delas (`imageText`) e só depois classifica
 * e extrai, apoiado no que acabou de escrever. A transcrição também entra nas regras que descartam o que não está no
 * post (ver `buildProcessedJob`).
 */
export const EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES = z.toJSONSchema(z.object({ imageText: z.string(), ...ModelOutputSchema.shape }))

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

// Só em posts com imagens: o prompt dos posts sem imagem (e a versão dele) continua o mesmo
const IMAGES_PROMPT = `

## Images attached to the post
The post comes with images. Some job posts put the details in an image (requirements, contract type, salary, contact email) and keep the text short ("details in the image"). Many other posts just show photos or screenshots.
- imageText: first, transcribe all the text written in the images, line by line, exactly as written (copy emails and URLs character by character). "" if the images have no text (a photo, a logo).
- The images do not change who the post is about. If the author writes in the first person about a project, product, app or site they built, it is NOT a job_opening, even if a screenshot of it says "contrate", "hire", "vagas" or "publique vagas": that is the product's own text, not a vacancy. Only a job ad in the image (a role being hired for, requirements, how to apply) can make the post a job_opening.
- Then classify and extract using both the post text and imageText. Every rule above that says "the post" or "the post text" also covers imageText: the values must be written in one of them.
- Use the images only for the same opening as the text. If the images describe other openings, follow the rule for several openings, and never mix fields from different openings.`

/** Qual vaga extrair de um post com várias: a mais próxima do cargo-alvo do perfil ou, sem perfil, a primeira. */
const SEVERAL_OPENINGS = {
	withTargetRole:
		'the opening closest to the role {targetRole}, even if it is not the first one listed (the first one only if no opening is related to that role)',
	withoutTargetRole: 'the first one',
}

/**
 * Versão do prompt: hash do texto e do formato pedidos ao modelo. Muda sozinha a cada edição do prompt, e é salva
 * em cada vaga para comparar os erros corrigidos pelo site entre versões. O cargo-alvo fica fora: é um dado, como o
 * post, e trocá-lo no perfil não cria uma versão nova. Posts com imagens usam `EXTRACTION_PROMPT_VERSION_WITH_IMAGES`.
 */
export const EXTRACTION_PROMPT_VERSION = new Bun.CryptoHasher('sha256')
	.update(SYSTEM_PROMPT_TEMPLATE)
	.update(JSON.stringify(SEVERAL_OPENINGS))
	.update(JSON.stringify(EXTRACTION_OUTPUT_FORMAT))
	.digest('hex')
	.slice(0, 12)

/** A versão do prompt usado nos posts com imagens (o de texto mais as instruções das imagens). */
export const EXTRACTION_PROMPT_VERSION_WITH_IMAGES = new Bun.CryptoHasher('sha256')
	.update(EXTRACTION_PROMPT_VERSION)
	.update(IMAGES_PROMPT)
	.update(JSON.stringify(EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES))
	.digest('hex')
	.slice(0, 12)

/** A versão do prompt usado na extração do post, com ou sem imagens. */
export function extractionPromptVersion(post: { images: readonly unknown[] }) {
	return post.images.length > 0 ? EXTRACTION_PROMPT_VERSION_WITH_IMAGES : EXTRACTION_PROMPT_VERSION
}

/** O formato pedido ao modelo na extração do post, com ou sem imagens. */
export function extractionOutputFormat(post: { images: readonly unknown[] }) {
	return post.images.length > 0 ? EXTRACTION_OUTPUT_FORMAT_WITH_IMAGES : EXTRACTION_OUTPUT_FORMAT
}

type ExtractionPost = { text: string; author: string | null; images?: readonly { data: string }[] }

/**
 * Mensagens da extração; `targetRole` é o cargo-alvo do perfil (`null` sem perfil). As imagens do post (base64) vão
 * na mensagem do post; sem imagens, as mensagens são as mesmas de antes delas.
 */
export function buildExtractionMessages(post: ExtractionPost, targetRole: string | null): Message[] {
	const severalOpenings = targetRole
		? SEVERAL_OPENINGS.withTargetRole.replace('{targetRole}', () => JSON.stringify(targetRole))
		: SEVERAL_OPENINGS.withoutTargetRole
	// Com função: um "$&" no cargo-alvo não vira o trecho substituído
	const system = SYSTEM_PROMPT_TEMPLATE.replace('{severalOpenings}', () => severalOpenings)
	const content = `Post author: ${post.author ?? 'unknown'}\nPost:\n${post.text}`
	const images = post.images ?? []

	if (images.length === 0) {
		return [
			{ role: 'system', content: system },
			{ role: 'user', content },
		]
	}

	return [
		{ role: 'system', content: system + IMAGES_PROMPT },
		{ role: 'user', content: `${content}\n\nImages attached: ${images.length}`, images: images.map(image => image.data) },
	]
}
