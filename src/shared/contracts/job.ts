import { z } from 'zod'

export const WORK_MODES = ['remoto', 'presencial', 'hibrido'] as const

/** Mensagem das filas `storage` e `discord`: vaga já estruturada. */
export const ProcessedJobSchema = z.object({
	postId: z.string().min(1),
	rawContent: z.string(),
	title: z.string().nullable(),
	company: z.string().nullable(),
	location: z.string().nullable(),
	/** Link de candidatura (site da vaga, formulário...), se houver. */
	applyLink: z.string().nullable(),
	necessaryKnowledge: z.array(z.string()).nullable(),
	recruiterEmail: z.string().nullable(),
	workMode: z.enum(WORK_MODES).nullable(),
	aiJobConfidence: z.number().min(0).max(100),
	postedAt: z.iso.datetime().nullable().default(null),
	author: z.string().nullable().default(null),
	/** Idioma do post (ISO 639-1), detectado no texto; `null` se curto demais. */
	language: z.string().nullable().default(null),
	/** Post que listava várias vagas, de onde esta saiu; `null` se a vaga é o próprio post. */
	sourcePostId: z.string().nullable().default(null),
	/** Link do post no LinkedIn (numa vaga de lista, o do post de origem); `null` se o scraper não achou o id do post. */
	postLink: z.string().nullable().default(null),
})
export type ProcessedJob = z.infer<typeof ProcessedJobSchema>
