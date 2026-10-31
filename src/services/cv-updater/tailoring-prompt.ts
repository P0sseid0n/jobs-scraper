import type { Message } from 'ollama'
import { z } from 'zod'

import type { ProfileSettings } from '@shared/contracts'
import { BASE_LOCALE, languageName, type Locale } from '@shared/i18n'

import type { ResumeContent } from './resume/resume.types'
import { skillsToAdd, unsupportedJobSkills } from './skills/skill-matching'
import type { TargetJob } from './target-job'

export const SKIP_CATEGORY = 'skip'

/** Formato tolerante para ler a resposta (o schema enviado ao modelo é mais estrito, ver `buildTailoringRequest`). */
const TailoringSuggestionsSchema = z.object({
	summary: z.string(),
	relevantSkills: z.array(z.string()).default([]),
	relevantProjects: z.array(z.string()).default([]),
	addedSkills: z.array(z.object({ skill: z.string(), category: z.string() })).default([]),
})

export type TailoringSuggestions = z.infer<typeof TailoringSuggestionsSchema>

const POST_MAX = 2500

/** As instruções do ajuste; `language` é o idioma da apresentação, em inglês ("Brazilian Portuguese", "English"). */
const systemPrompt = (language: string) => `You tailor a professional's résumé (from any field, not only software) to a job opening.
The "Candidate profile", when given, tells the person's field and target role.

Return JSON with:
- summary: a rewritten summary paragraph in ${language} (2 to 3 sentences, at most 450 characters).
  Emphasize what matches the job and mention the job's main required skills, tools or qualifications that the résumé
  shows (or that are in "Skills to add").
  Never invent skills, tools, companies, certifications, degrees or years of experience, and never mention the items
  in "Not in the résumé": the person does not have them. "Other sections" (education, certifications, languages) are
  facts you may use but must not change.
  It is the person presenting themselves, in the same style as the base summary: short phrases led by the role or an
  adjective ("Desenvolvedor Front-end com experiência em Vue.js e TypeScript.", "Experiente em testes com Jest."; in
  English: "Front-end Developer experienced in Vue.js and TypeScript."), with no "eu" or "I" and no candidate name.
  Write it in ${language} even when the résumé is in another language.
  Never describe the person from the outside, as a recruiter or an evaluation would: no "o perfil", "o candidato",
  "possui", "demonstra", "complementa", "suas habilidades", "para esta posição", "conjunto de habilidades", "the
  candidate", "this profile", "demonstrates", "possesses", "their skills", "for this position". Avoid repeating words.
- relevantSkills: skills from the résumé "Skills" list that are related to this job, copied exactly, most relevant first.
  Skills can be technologies, tools, techniques or soft skills. Include closely related ones (e.g. for a Vue.js job:
  Nuxt.js, Pinia; for a paid traffic job: Google Ads, Meta Ads) and leave out unrelated ones.
- relevantProjects: project names from the "Projects" list, most relevant to the job first.
- addedSkills: for EVERY item in "Skills to add" (technologies the job asks for), the résumé category where it fits
  best, by meaning: databases and server frameworks -> back-end; UI frameworks and CSS -> front-end;
  programming languages -> languages; cloud providers (AWS, Azure, GCP), CI/CD, containers and other DevOps/tools ->
  the tools category. Use "skip" only when no category is related to the item at all.`

/** Área e cargo-alvo do perfil profissional, quando preenchidos (sem perfil, o pedido fica como antes). */
export type TailoringProfile = Partial<Pick<ProfileSettings, 'area' | 'targetRole'>>

/**
 * Monta o pedido de ajuste à IA (mensagens e schema de saída) e a lista de tecnologias a adicionar. A apresentação sai
 * em `locale`, o idioma do currículo da vaga.
 */
export function buildTailoringRequest(
	cv: ResumeContent,
	job: TargetJob,
	profile: TailoringProfile = {},
	locale: Locale = BASE_LOCALE,
) {
	const categories = cv.skills.map(group => group.category)
	const toAdd = skillsToAdd(cv, job)
	const unsupported = unsupportedJobSkills(cv, job)
	const candidate = describeProfile(profile)

	const content = [
		...(candidate ? [`## Candidate profile\n${candidate}`] : []),
		`## Résumé\n${describeResume(cv, categories)}`,
		`## Job opening\n${describeJob(job)}`,
		`## Skills to add\n${toAdd.join(', ') || 'none'}`,
		...(unsupported.length > 0 ? [`## Not in the résumé\n${unsupported.join(', ')}`] : []),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: systemPrompt(languageName(locale, 'en')) },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(outputSchema(categories, toAdd)), toAdd }
}

/** Pede ao modelo outra apresentação, informando por que a anterior foi rejeitada. */
export function buildRetryMessage(reason: string): Message {
	return { role: 'user', content: `Your summary was rejected: ${reason}. Rewrite it and return the full JSON again.` }
}

export function parseTailoringSuggestions(content: string): TailoringSuggestions {
	return TailoringSuggestionsSchema.parse(JSON.parse(content))
}

/** Cria o schema de saída com categorias e tecnologias como enums, para o modelo não inventar valores. */
function outputSchema(categories: string[], toAdd: string[]) {
	return z.object({
		summary: z.string(),
		relevantSkills: z.array(z.string()),
		relevantProjects: z.array(z.string()),
		addedSkills: z.array(
			z.object({
				skill: toAdd.length > 0 ? z.enum(toAdd as [string, ...string[]]) : z.string(),
				category: z.enum([SKIP_CATEGORY, ...categories] as [string, ...string[]]),
			}),
		),
	})
}

function describeResume(cv: ResumeContent, categories: string[]) {
	const projects = cv.projects.map(project => `${project.name} (${project.technologies.join(', ')})`)
	const experience = cv.experience.map(entry => `${entry.header}: ${entry.bullets.join(' ')}`)
	const otherSections = cv.otherSections.map(section => `${section.title}: ${section.text}`)

	return [
		`Base summary: ${cv.summary}`,
		`Skills: ${cv.skills.flatMap(group => group.items).join(' | ')}`,
		`Skill categories: ${categories.join(' | ')}`,
		...(projects.length > 0 ? [`Projects: ${projects.join(' | ')}`] : []),
		`Experience: ${experience.join(' | ')}`,
		...(otherSections.length > 0 ? [`Other sections: ${otherSections.join(' | ')}`] : []),
	].join('\n')
}

/** Descreve o perfil para o modelo (vazio sem área nem cargo-alvo). */
export function describeProfile(profile: TailoringProfile) {
	return [
		...(profile.area ? [`Field: ${profile.area}`] : []),
		...(profile.targetRole ? [`Target role: ${profile.targetRole}`] : []),
	].join('\n')
}

function describeJob(job: TargetJob) {
	return [
		`Title: ${job.title ?? 'unknown'}`,
		`Company: ${job.company ?? 'unknown'}`,
		`Required skills: ${job.necessaryKnowledge?.join(', ') || 'not listed'}`,
		`Post: ${job.rawContent.normalize('NFKC').slice(0, POST_MAX)}`,
	].join('\n')
}
