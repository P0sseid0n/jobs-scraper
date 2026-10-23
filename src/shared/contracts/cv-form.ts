import { z } from 'zod'

/**
 * Dados do currículo base preenchidos no formulário do site. O cv-updater gera o `.tex` a partir deles
 * (`resume/latex-from-form.ts`), e a versão guarda os dados para o formulário reabrir preenchido.
 */

/** Seções do formulário, com as mesmas chaves das seções que o cv-updater reconhece no `.tex`. */
export const CV_FORM_SECTIONS = ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'] as const
export type CvFormSectionKind = (typeof CV_FORM_SECTIONS)[number]

/** Máximo de itens de cada lista (experiências, tópicos, links...): bem acima do que cabe numa página. */
export const CV_FORM_MAX_ITEMS = 20

const text = (max = 200) => z.string().trim().max(max)
const list = <T extends z.ZodType>(item: T) => z.array(item).max(CV_FORM_MAX_ITEMS)

const ContactSchema = z.object({
	name: text().min(1, 'Preencha o nome'),
	/** Cargo ou título abaixo do nome (ex.: "Enfermeira | COREN-SP 000.000"). */
	headline: text(),
	location: text(),
	email: text(),
	phone: text(),
	/** Endereços (LinkedIn, portfólio...), mostrados sem o `https://`. */
	links: list(text(300)),
})

const SummarySectionSchema = z.object({ kind: z.literal('summary'), text: text(3000) })

const SkillsSectionSchema = z.object({
	kind: z.literal('skills'),
	groups: list(z.object({ category: text(), items: list(text(100)) })),
})

const ExperienceSectionSchema = z.object({
	kind: z.literal('experience'),
	entries: list(z.object({ role: text(), company: text(), period: text(100), bullets: list(text(500)) })),
})

const EducationSectionSchema = z.object({
	kind: z.literal('education'),
	entries: list(z.object({ course: text(), institution: text(), period: text(100) })),
})

const CertificationsSectionSchema = z.object({
	kind: z.literal('certifications'),
	entries: list(z.object({ name: text(), issuer: text(), year: text(100) })),
})

const LanguagesSectionSchema = z.object({
	kind: z.literal('languages'),
	entries: list(z.object({ language: text(100), level: text(100) })),
})

const ProjectsSectionSchema = z.object({
	kind: z.literal('projects'),
	entries: list(z.object({ name: text(), url: text(300), description: text(1000), technologies: list(text(100)) })),
})

export const CvFormSectionSchema = z.discriminatedUnion('kind', [
	SummarySectionSchema,
	SkillsSectionSchema,
	ExperienceSectionSchema,
	EducationSectionSchema,
	CertificationsSectionSchema,
	LanguagesSectionSchema,
	ProjectsSectionSchema,
])

export type CvFormSection = z.infer<typeof CvFormSectionSchema>
/** A seção de um tipo (ex.: `CvFormSectionOf<'experience'>`). */
export type CvFormSectionOf<K extends CvFormSectionKind> = Extract<CvFormSection, { kind: K }>

/** O currículo do formulário: o contato e as seções, na ordem em que aparecem no PDF (cada tipo no máximo uma vez). */
export const CvFormSchema = z.object({
	contact: ContactSchema,
	sections: z
		.array(CvFormSectionSchema)
		.max(CV_FORM_SECTIONS.length)
		.refine(sections => new Set(sections.map(section => section.kind)).size === sections.length, 'Seção repetida'),
})

export type CvForm = z.infer<typeof CvFormSchema>
