import { z } from 'zod'

/** Mensagem da fila `post-processing`: post bruto vindo do scraper. */
export const RawPostSchema = z.object({
	postId: z.string().min(1),
	text: z.string().min(1),
	/** Link do post no LinkedIn (numa vaga de lista, o do post de origem). */
	url: z.url().nullable().default(null),
	author: z.string().nullable().default(null),
	postedAt: z.iso.datetime().nullable().default(null),
	scrapedAt: z.iso.datetime(),
	/** Post que listava várias vagas, de onde esta saiu (ver `JobLookupSchema`); `null` num post comum. */
	sourcePostId: z.string().nullable().default(null),
	/** Link de candidatura já conhecido (numa vaga de lista, o da vaga); sem ele, vale o que a IA achar no texto. */
	jobLink: z.url().nullable().default(null),
	/**
	 * Link do cartão anexado ao post (pré-visualização de um site), fora do texto. Em reposts de sites de vagas o texto
	 * vem cortado e é ele que leva à vaga; vale como candidatura quando o texto não tem link.
	 */
	attachedLink: z.url().nullable().default(null),
})
export type RawPost = z.infer<typeof RawPostSchema>
