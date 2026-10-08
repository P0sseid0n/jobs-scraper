import { z } from 'zod'

export const WORK_MODES = ['remoto', 'presencial', 'hibrido'] as const

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
	author: z.string().nullable().default(null),
	/** Idioma do post (ISO 639-1), detectado no texto; `null` se curto demais. */
	language: z.string().nullable().default(null),
})
export type ProcessedJob = z.infer<typeof ProcessedJobSchema>
