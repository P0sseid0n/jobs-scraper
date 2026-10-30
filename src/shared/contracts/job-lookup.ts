import { z } from 'zod'

import { ReprocessIdSchema } from './job-reprocess'

/**
 * Mensagem da fila `scraper-lookup`: uma vaga de um post que lista várias. O scraper abre o link no navegador
 * logado (uma por vez, com pausa, como uma busca) e manda o texto da página para o post-processing.
 */
export const JobLookupSchema = z.object({
	/** ID da vaga (hash do link): é o `postId` do post que o scraper vai gerar. */
	postId: z.string().min(1),
	sourcePostId: z.string().min(1),
	sourcePostUrl: z.url().nullable(),
	title: z.string().min(1),
	link: z.url(),
	/** As linhas do post sobre esta vaga, usadas se a página não abrir. */
	text: z.string().min(1),
	author: z.string().nullable(),
	/** Ver `RawPostSchema`; o padrão aceita mensagens de antes do campo. */
	authorIsCompany: z.boolean().default(false),
	postedAt: z.iso.datetime().nullable(),
	requestedAt: z.iso.datetime(),
	/** Pedido do "processar de novo" (ver `ReprocessIdSchema`): a página que não abrir é uma falha, sem o texto do post. */
	reprocessId: ReprocessIdSchema,
})

export type JobLookup = z.infer<typeof JobLookupSchema>
