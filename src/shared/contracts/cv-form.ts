import { z } from 'zod'

/**
 * Dados do currículo base preenchidos no formulário do site. O cv-updater gera o `.tex` a partir deles
 * (`resume/latex-from-form.ts`), e a versão guarda os dados para o formulário reabrir preenchido.
 */

/** Seções do formulário, com as mesmas chaves das seções que o cv-updater reconhece no `.tex`. */
export const CV_FORM_SECTIONS = ['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'projects'] as const
export type CvFormSectionKind = (typeof CV_FORM_SECTIONS)[number]

/**
 * Título de cada seção no PDF quando a pessoa não escreve outro. Um título próprio precisa ser um dos sinônimos que o
 * cv-updater reconhece para a mesma seção (`resume/latex-syntax.ts`), senão o ajuste à vaga não a encontra.
 */
export const CV_FORM_DEFAULT_TITLES: Record<CvFormSectionKind, string> = {
	summary: 'Apresentação',
	skills: 'Habilidades',
	experience: 'Experiência Profissional',
	education: 'Formação',
	certifications: 'Certificações e Cursos',
	languages: 'Idiomas',
	projects: 'Projetos',
}

/** Rótulos aceitos para a linha de ferramentas dos projetos (`	extit{Ferramentas: ...}`); o primeiro é o padrão. */
export const CV_FORM_TOOLS_LABELS = ['Ferramentas', 'Tecnologias'] as const

/** Máximo de itens de cada lista (experiências, tópicos, links...): bem acima do que cabe numa página. */
export const CV_FORM_MAX_ITEMS = 20

const text = (max = 200) => z.string().trim().max(max)
const list = <T extends z.ZodType>(item: T) => z.array(item).max(CV_FORM_MAX_ITEMS)

/** Título da seção no PDF; vazio usa o de CV_FORM_DEFAULT_TITLES. O padrão aceita os dados de antes do campo. */
const title = text(100).default('')

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

const SummarySectionSchema = z.object({ kind: z.literal('summary'), title, text: text(3000) })

const SkillsSectionSchema = z.object({
	kind: z.literal('skills'),
	title,
	groups: list(z.object({ category: text(), items: list(text(100)) })),
})

const ExperienceSectionSchema = z.object({
	kind: z.literal('experience'),
	title,
	entries: list(z.object({ role: text(), company: text(), period: text(100), bullets: list(text(500)) })),
})

const EducationSectionSchema = z.object({
	kind: z.literal('education'),
	title,
	entries: list(z.object({ course: text(), institution: text(), period: text(100) })),
})

const CertificationsSectionSchema = z.object({
	kind: z.literal('certifications'),
	title,
	entries: list(z.object({ name: text(), issuer: text(), year: text(100) })),
})

const LanguagesSectionSchema = z.object({
	kind: z.literal('languages'),
	title,
	entries: list(z.object({ language: text(100), level: text(100) })),
})

const ProjectsSectionSchema = z.object({
	kind: z.literal('projects'),
	title,
	entries: list(z.object({ name: text(), url: text(300), description: text(1000), technologies: list(text(100)) })),
	/** Rótulo da linha de ferramentas de cada projeto. O padrão aceita os dados de antes do campo. */
	toolsLabel: z.enum(CV_FORM_TOOLS_LABELS).default(CV_FORM_TOOLS_LABELS[0]),
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
/** O formulário como chega (campos com padrão podem faltar, como nas versões de antes deles). */
export type CvFormInput = z.input<typeof CvFormSchema>
