import { z } from 'zod'

import { ReprocessIdSchema } from './job-reprocess'

/**
 * Limites das imagens de um post: a extração fica mais lenta a cada imagem, e elas vão em base64 dentro da mensagem
 * da fila e ficam guardadas no MongoDB (as URLs do LinkedIn expiram).
 */
export const POST_IMAGE_LIMITS = { maxImages: 2, maxBytes: 1_500_000 } as const

export const POST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export type PostImageType = (typeof POST_IMAGE_TYPES)[number]

/** Imagem do conteúdo de um post, baixada na coleta. */
export const PostImageSchema = z.object({
	mimeType: z.enum(POST_IMAGE_TYPES),
	/** O arquivo em base64 (sem o prefixo `data:`). */
	data: z.base64().max(Math.ceil(POST_IMAGE_LIMITS.maxBytes / 3) * 4, 'Imagem maior que o limite'),
})
export type PostImage = z.infer<typeof PostImageSchema>

/** Mensagem da fila `post-processing`: post bruto vindo do scraper. */
export const RawPostSchema = z.object({
	postId: z.string().min(1),
	text: z.string().min(1),
	/** Link do post no LinkedIn (numa vaga de lista, o do post de origem). */
	url: z.url().nullable().default(null),
	author: z.string().nullable().default(null),
	/** O autor é uma página de empresa (`/company/`), não uma pessoa: o nome dele conta como a empresa da vaga. */
	authorIsCompany: z.boolean().default(false),
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
	/** Imagens do conteúdo do post (artes com requisitos, contato...); o padrão aceita mensagens de antes do campo. */
	images: z.array(PostImageSchema).max(POST_IMAGE_LIMITS.maxImages).default([]),
	reprocessId: ReprocessIdSchema,
})
export type RawPost = z.infer<typeof RawPostSchema>
