import { z } from 'zod'

/**
 * Mensagem da fila `web-applied`: a candidatura marcada (`appliedAt` com a data) ou desmarcada (`null`) fora do site, pelo
 * botão do Discord. O banco já foi atualizado: o site só avisa os navegadores abertos.
 */
export const JobAppliedChangeSchema = z.object({
	postId: z.string().min(1),
	appliedAt: z.iso.datetime().nullable(),
})

export type JobAppliedChange = z.infer<typeof JobAppliedChangeSchema>
