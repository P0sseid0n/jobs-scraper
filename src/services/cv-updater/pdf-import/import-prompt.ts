import type { Message } from 'ollama'
import { z } from 'zod'

import type { PdfText } from './pdf-text'

/** Texto do PDF enviado ao modelo: um currículo de duas páginas tem por volta de 6 mil caracteres. */
const TEXT_MAX = 15_000

const text = z.string().default('')
const texts = z.array(z.string()).default([])

/** Formato tolerante para ler a resposta: campos que faltam ficam vazios. */
const ImportOutputSchema = z.object({
	contact: z
		.object({ name: text, headline: text, location: text, email: text, phone: text, links: texts })
		.default({ name: '', headline: '', location: '', email: '', phone: '', links: [] }),
	summary: text,
	skills: z.array(z.object({ category: text, items: texts })).default([]),
	experience: z.array(z.object({ role: text, company: text, period: text, bullets: texts })).default([]),
	education: z.array(z.object({ course: text, institution: text, period: text })).default([]),
	certifications: z.array(z.object({ name: text, issuer: text, year: text })).default([]),
	languages: z.array(z.object({ language: text, level: text })).default([]),
	projects: z.array(z.object({ name: text, url: text, description: text, technologies: texts })).default([]),
})

export type ImportOutput = z.infer<typeof ImportOutputSchema>

const SYSTEM_PROMPT = `You copy the text of a résumé (from any professional field) into the fields of a form.

Return JSON with:
- contact: name; headline (the role or title under the name, e.g. "Enfermeira | COREN-SP 000.000"); location; email;
  phone; links (the person's web addresses: LinkedIn, portfolio, GitHub profile...; not the links of projects).
- summary: the whole presentation paragraph ("Resumo", "Sobre", "Perfil", "Objetivo", "Summary"...), every sentence
  and every line of it, up to the next section title.
- skills: groups with a category and its items. When the résumé lists skills without categories, use one group with
  an empty category.
- experience: each job with role, company, period (as written, e.g. "Março 2021 - Presente") and bullets (one per
  item describing the job, whole even when it continues on the next line).
- education: course (degree or program), institution and period.
- certifications: certificates and courses, with name, issuer and year.
- languages: spoken languages (Portuguese, English, Spanish...) and level. Programming languages are skills, never
  languages.
- projects: name, url, description and technologies.

Rules:
- Copy the text exactly as it is in the résumé, in its original language. Never translate, summarize, rephrase,
  correct or complete anything.
- Never invent: a field that is not in the résumé stays empty ("" or []). Do not guess the company, the period, the
  level of a language or the category of a skill.
- Leave out bullet symbols (•, -, *) at the start of items and the section titles themselves.
- If the text is not a résumé, return every field empty.`

/** Monta o pedido ao modelo: o texto do PDF, os links clicáveis e o schema de saída. */
export function buildImportRequest(pdf: PdfText) {
	const content = [
		`## Résumé text\n${pdf.text.slice(0, TEXT_MAX)}`,
		...(pdf.links.length > 0 ? [`## Links in the résumé\n${pdf.links.join('\n')}`] : []),
	].join('\n\n')

	const messages: Message[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content },
	]

	return { messages, format: z.toJSONSchema(ImportOutputSchema) }
}

/** Pede a resposta de novo, com o motivo da falha (JSON inválido ou fora do schema). */
export function buildImportRetryMessage(reason: string): Message {
	return { role: 'user', content: `Your answer could not be read: ${reason}. Return the full JSON again, following the schema.` }
}

/** @throws {SyntaxError | ZodError} Se a resposta não for um JSON no formato pedido. */
export function parseImportOutput(content: string): ImportOutput {
	return ImportOutputSchema.parse(JSON.parse(content))
}
