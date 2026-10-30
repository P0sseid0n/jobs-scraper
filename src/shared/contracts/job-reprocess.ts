import { z } from 'zod'

import { CORRECTABLE_FIELDS } from './job-correction'

/**
 * Id do pedido do site para processar de novo uma vaga já salva ("processar de novo"), levado pelo post até o
 * post-processing, que atualiza a vaga em vez de pular o post já visto. Volta no `JobReprocessResult`; `null` na coleta.
 */
export const ReprocessIdSchema = z.string().min(1).nullable().default(null)

/**
 * Mensagem da fila `scraper-post`: um post do LinkedIn para o scraper ler de novo (a vaga avulsa, de um post só) e
 * mandar ao post-processing, como na coleta. O id, o link e a data são os da vaga salva.
 */
export const PostRereadSchema = z.object({
	postId: z.string().min(1),
	url: z.url(),
	postedAt: z.iso.datetime().nullable(),
	reprocessId: z.string().min(1),
})
export type PostReread = z.infer<typeof PostRereadSchema>

export const JOB_REPROCESS_STATUSES = ['updated', 'discarded', 'failed'] as const
export type JobReprocessStatus = (typeof JOB_REPROCESS_STATUSES)[number]

/**
 * Mensagem da fila `web-reprocess`: como terminou o "processar de novo". `updated`: a vaga foi extraída de novo e
 * atualizada; `discarded`: a nova extração descartaria a vaga, que fica como estava; `failed`: o scraper não conseguiu
 * ler a página ou o post de novo. `keptFields`: os campos corrigidos pelo site, mantidos na vaga atualizada.
 */
export const JobReprocessResultSchema = z.object({
	reprocessId: z.string().min(1),
	postId: z.string().min(1),
	status: z.enum(JOB_REPROCESS_STATUSES),
	reason: z.string().nullable().default(null),
	keptFields: z.array(z.enum(CORRECTABLE_FIELDS)).default([]),
})
export type JobReprocessResult = z.infer<typeof JobReprocessResultSchema>
