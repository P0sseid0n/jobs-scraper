import { z } from 'zod'

export const WORK_MODES = ['remoto', 'presencial', 'hibrido'] as const

/** Mensagem da fila `post_processing`: post bruto vindo do scraper. */
export const RawPostSchema = z.object({
	postId: z.string().min(1),
	text: z.string().min(1),
	scrapedAt: z.iso.datetime(),
})
export type RawPost = z.infer<typeof RawPostSchema>

const nullableString = z
	.string()
	.trim()
	.transform(value => value || null)
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
		.transform(items => items.map(item => item.trim()).filter(Boolean))
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

/** Mensagem das filas `storage` e `send-discord-message`: vaga já estruturada. */
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
})
export type ProcessedJob = z.infer<typeof ProcessedJobSchema>
