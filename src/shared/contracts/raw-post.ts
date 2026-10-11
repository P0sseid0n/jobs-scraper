import { z } from 'zod'

/** Mensagem da fila `post-processing`: post bruto vindo do scraper. */
export const RawPostSchema = z.object({
	postId: z.string().min(1),
	text: z.string().min(1),
	url: z.url().nullable().default(null),
	author: z.string().nullable().default(null),
	postedAt: z.iso.datetime().nullable().default(null),
	scrapedAt: z.iso.datetime(),
	/** Post que listava várias vagas, de onde esta saiu (ver `JobLookupSchema`); `null` num post comum. */
	sourcePostId: z.string().nullable().default(null),
})
export type RawPost = z.infer<typeof RawPostSchema>
