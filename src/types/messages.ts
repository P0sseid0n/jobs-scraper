import { z } from 'zod'

export const WORK_MODES = ['remoto', 'presencial', 'hibrido'] as const

/** Mensagem da fila `post-processing`: post bruto vindo do scraper. */
export const RawPostSchema = z.object({
	postId: z.string().min(1),
	text: z.string().min(1),
	url: z.url().nullable().default(null),
	author: z.string().nullable().default(null),
	postedAt: z.iso.datetime().nullable().default(null),
	scrapedAt: z.iso.datetime(),
})
export type RawPost = z.infer<typeof RawPostSchema>

/** Textos que o modelo às vezes devolve como string em vez do `null` do JSON. */
const EMPTY_VALUES = new Set(['', 'null', 'none', 'n/a', 'na', 'undefined', '-', 'string'])

const nullableString = z
	.string()
	.trim()
	.transform(value => (EMPTY_VALUES.has(value.toLowerCase()) ? null : value))
	.nullable()
	.catch(null)

/**
 * Schema tolerante para a saída do modelo de IA: campos ausentes ou com tipo errado viram `null`
 * em vez de invalidar a resposta inteira.
 */
export const AiJobOutputSchema = z.object({
	title: nullableString,
	company: nullableString,
	location: nullableString,
	link: nullableString,
	necessary_knowledge: z
		.union([z.array(z.string()), z.string().transform(value => value.split(','))])
		.transform(items => {
			const knowledge = items.map(item => item.trim()).filter(item => !EMPTY_VALUES.has(item.toLowerCase()))
			return knowledge.length > 0 ? knowledge : null
		})
		.nullable()
		.catch(null),
	recruiter_email: nullableString,
	workMode: z
		.string()
		.transform(value =>
			value
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '')
				.toLowerCase(),
		)
		.pipe(z.enum(WORK_MODES))
		.nullable()
		.catch(null),
	aiJobConfidence: z.coerce.number().min(0).max(100).catch(0),
})
export type AiJobOutput = z.infer<typeof AiJobOutputSchema>

/** Mensagem das filas `storage` e `discord`: vaga já estruturada. */
export const ProcessedJobSchema = z.object({
	postId: z.string().min(1),
	rawContent: z.string(),
	title: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	link: z.string().nullable(),
	necessary_knowledge: z.array(z.string()).nullable(),
	recruiter_email: z.string().nullable(),
	workMode: z.enum(WORK_MODES).nullable(),
	aiJobConfidence: z.number().min(0).max(100),
	postedAt: z.iso.datetime().nullable().default(null),
})
export type ProcessedJob = z.infer<typeof ProcessedJobSchema>
